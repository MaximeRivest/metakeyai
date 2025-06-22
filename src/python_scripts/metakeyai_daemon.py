#!/usr/bin/env python3
"""
MetaKeyAI background Python daemon
---------------------------------
Simple JSON-lines (one object per line) protocol over stdin/stdout.
Each request is a dict with at least:
    { "id": <int>, "cmd": <str>, ... }
Responses mirror the id and either provide "result" or "error".

Initially supports:
  • ping                     -> "pong"
  • cast  (spellId, scriptFile, input)
       Runs the given Python script *within the same interpreter* so heavy
       libraries stay warm between calls.  The spell script should expose a
       `main(text:str) -> str` callable.  If not found we fall back to
       executing the script in a separate namespace using runpy.
  • list_spells              -> returns currently cached spell ids

The daemon keeps a cache of imported spell modules so repeated requests are
instant.
"""

import json
import sys
import time
import types
import runpy
import importlib.util
import traceback
from pathlib import Path
from typing import Dict, Any
import os
import io

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(*args, **kwargs):
    """Print to stderr so stdout stays protocol-clean."""
    print(*args, file=sys.stderr, **kwargs)


def send(obj: Dict[str, Any]):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_spell_module(script_file: str) -> types.ModuleType:
    """Load (and cache) a spell module from arbitrary path."""
    script_path = Path(script_file).resolve()
    if not script_path.exists():
        raise FileNotFoundError(f"spell script not found: {script_path}")

    module_name = f"metakeyai_spell_{script_path.stem}_{abs(hash(str(script_path)))}"

    if module_name in sys.modules:
        return sys.modules[module_name]

    spec = importlib.util.spec_from_file_location(module_name, str(script_path))
    if spec is None or spec.loader is None:  # type: ignore
        raise ImportError(f"cannot import spell module from {script_path}")

    module = importlib.util.module_from_spec(spec)  # type: ignore
    # Provide dspy and default LM to spell namespace automatically
    if dspy is not None:
        try:
            import importlib as _il
            dspy_settings = _il.import_module('dspy').settings  # type: ignore
            if getattr(dspy_settings, 'lm', None) is None:
                # configure LM from env if missing
                model_str = os.getenv('METAKEYAI_LLM') or 'openai/gpt-3.5-turbo'
                try:
                    dspy_settings.lm = dspy.LM(model_str)
                except Exception as _e:
                    log('Failed to create default LM:', _e)
        except Exception as _e:
            log('failed to prepare default LM for spell:', _e)
        module.__dict__['dspy'] = dspy

    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore
    return module


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def cmd_ping(_payload):
    return "pong"


def cmd_cast(payload):
    spell_id = payload.get("spellId") or "unknown"
    script_file = payload.get("scriptFile")
    if not script_file and spell_id in SPELL_REGISTRY:
        script_file = SPELL_REGISTRY[spell_id]["scriptFile"]
        if not script_file:
            raise ValueError("No scriptFile provided and not found in registry for spell " + spell_id)
    input_text = payload.get("input", "")

    start = time.time()
    original_stdin = sys.stdin
    original_stdout = sys.stdout
    if input_text:
        sys.stdin = io.StringIO(input_text)
    
    # Capture stdout
    sys.stdout = captured_stdout = io.StringIO()

    try:
        mod = load_spell_module(script_file)
        if hasattr(mod, "main"):
            result = mod.main(input_text)  # type: ignore[arg-type]
        else:
            # Fallback: run the script in a new namespace with our globals
            ns = {
                "__name__": "__spell__",
                "INPUT_TEXT": input_text,
                "dspy": dspy,
                "sys": sys,
            }
            runpy.run_path(script_file, init_globals=ns)
            result = captured_stdout.getvalue()
        success = True
        error_msg = None
    except Exception as e:
        log("Spell execution failed:", e)
        result = ""
        success = False
        error_msg = str(e)
    finally:
        sys.stdin = original_stdin
        sys.stdout = original_stdout

    return {
        "spellId": spell_id,
        "success": success,
        "output": result,
        "executionTime": int((time.time() - start) * 1000),
        "error": error_msg,
    }


def cmd_list_spells(_payload):
    # Return discovered spell metadata
    return list(SPELL_REGISTRY.values())


# ---------------- LLM / ENV management -----------------

try:
    import dspy  # type: ignore
except ImportError:
    dspy = None  # will complain on first configure attempt


def _configure_llm_from_env():
    """(Re)configure DSPy default LLM from environment vars.

    Expected convention: user sets METAKEYAI_LLM string env var (e.g. "openai/gpt-4o"),
    plus whatever keys LightLLM requires (OPENAI_API_KEY, BASE_URL, etc.).
    If METAKEYAI_LLM is not set we skip configuration to allow spells to manage
    their own context as a fallback.
    """
    if not dspy:
        log("dspy not installed – cannot configure default LLM")
        return

    model_name = os.getenv("METAKEYAI_LLM")
    if model_name:
        try:
            # Prefer setting the global settings.lm so DSPy modules reuse it,
            # but avoid calling dspy.configure() (side-effects in some builds).
            import importlib
            dspy_settings = importlib.import_module('dspy').settings  # type: ignore
            dspy_settings.lm = dspy.LM(model_name)
            log("DSPy default LLM configured ->", model_name)
        except Exception as e:
            log("Failed to set DSPy default LLM via settings:", e)


def cmd_update_env(payload):
    env_map = payload.get("env", {})
    if not isinstance(env_map, dict):
        raise ValueError("env must be a dict of string:string")
    for k, v in env_map.items():
        os.environ[str(k)] = str(v)
    _configure_llm_from_env()

    # simple connectivity test
    ok = False
    msg = ""
    if dspy:
        try:
            model_str = os.getenv("METAKEYAI_LLM", "")
            if model_str:
                tmp_lm = dspy.LM(model_str)
                test_out = tmp_lm("Hello")  # type: ignore
                ok = len(test_out) > 0
        except Exception as e:
            msg = str(e)
    return {"updated": list(env_map.keys()), "ok": ok, "msg": msg}


# Implementation of quick_edit
def cmd_quick_edit(payload):
    text = payload.get("text", "")
    if not text:
        return ""
    if not dspy:
        return text.upper()  # fallback

    try:
        # Prefer an already-configured LM but lazily construct one using METAKEYAI_LLM
        import importlib
        dspy_settings = importlib.import_module('dspy').settings  # type: ignore
        lm = getattr(dspy_settings, 'lm', None)
        if lm is None:
            model_str = os.getenv("METAKEYAI_LLM") or "openai/gpt-3.5-turbo"
            lm = dspy.LM(model_str)
            dspy_settings.lm = lm  # cache for subsequent calls
        print(f"Using LM: {lm}")
        print(f"Text: {text}")
        # Avoid global configure; instantiate local Predict with explicit lm if needed
        qedit = dspy.Predict("prompt -> answer", lm=lm)
        improved = qedit(prompt=text).answer  # type: ignore
        return improved.strip()
    except Exception as e:
        log("quick_edit failed:", e)
        return text  # return original on failure


COMMANDS = {
    "ping": cmd_ping,
    "cast": cmd_cast,
    "list_spells": cmd_list_spells,
    "quick_edit": cmd_quick_edit,
    "update_env": cmd_update_env,
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
        req_id = msg.get("id")
        cmd = msg.get("cmd")
        handler = COMMANDS.get(cmd)
        if handler is None:
            raise ValueError(f"unknown cmd '{cmd}'")
        result = handler(msg)
        send({"id": req_id, "result": result})
    except Exception as e:
        send({
            "id": msg.get("id") if 'msg' in locals() else -1,
            "error": str(e),
            "trace": traceback.format_exc(),
        }) 

# ---------------- Spell discovery -----------------

SPELLS_DIR = Path(__file__).parent / "spells"
SPELL_REGISTRY: Dict[str, Dict[str, Any]] = {}


def _discover_spells():
    """Scan the spells directory and load META info."""
    if not SPELLS_DIR.exists():
        return
    for py_file in SPELLS_DIR.glob("*.py"):
        try:
            mod = load_spell_module(str(py_file))
            meta = getattr(mod, "META", None)
            if meta and isinstance(meta, dict) and "id" in meta:
                SPELL_REGISTRY[meta["id"]] = {
                    **meta,
                    "scriptFile": str(py_file),
                }
        except Exception as e:
            log("Failed to load spell", py_file, e)


# Initial configuration
_configure_llm_from_env()

# Discover at import time
_discover_spells() 