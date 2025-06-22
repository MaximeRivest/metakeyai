#!/usr/bin/env python3
"""
MetaKeyAI background Python daemon
---------------------------------
- Converted from stdio JSON-RPC to a local FastAPI HTTP server.
- Provides endpoints for spell management and execution.
- Retains in-memory caching of spell modules for performance.
"""

import json
import sys
import time
import types
import runpy
import importlib.util
import traceback
from pathlib import Path
from typing import Dict, Any, List, Optional
import os
import io
import tempfile
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# ---------------------------------------------------------------------------
# Helpers (logging to stderr)
# ---------------------------------------------------------------------------

def log(*args, **kwargs):
    """Print to stderr so stdout stays clean for server logs."""
    print(*args, file=sys.stderr, **kwargs)

# ---------------------------------------------------------------------------
# Spell Loading and Caching
# ---------------------------------------------------------------------------

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
    if _safe_import_dspy():
        try:
            if getattr(dspy.settings, 'lm', None) is None:
                model_str = os.getenv('METAKEYAI_LLM') or 'openai/gpt-3.5-turbo'
                try:
                    dspy.settings.lm = dspy.LM(model_str)
                except Exception as _e:
                    log('Failed to create default LM:', _e)
        except Exception as _e:
            log('failed to prepare default LM for spell:', _e)
        module.__dict__['dspy'] = dspy

    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore
    return module

# ---------------------------------------------------------------------------
# LLM / ENV management
# ---------------------------------------------------------------------------

# More robust DSPy import handling for PyInstaller
dspy = None
dspy_import_error = None

def _safe_import_dspy():
    """Safely import dspy with detailed error handling for PyInstaller."""
    global dspy, dspy_import_error
    
    if dspy is not None:
        return True
    
    # Temporarily disable DSPy in PyInstaller builds
    if getattr(sys, 'frozen', False):
        dspy_import_error = "DSPy disabled in packaged builds (temporary)"
        log(f"⚠️ {dspy_import_error}")
        return False
    
    try:
        import dspy as _dspy
        dspy = _dspy
        log("✅ DSPy imported successfully")
        return True
    except ImportError as e:
        dspy_import_error = f"DSPy not installed: {e}"
        log(f"⚠️ {dspy_import_error}")
        return False
    except Exception as e:
        dspy_import_error = f"DSPy import failed: {e}"
        log(f"❌ {dspy_import_error}")
        # Log more details for debugging
        import traceback
        log(f"DSPy import traceback:\n{traceback.format_exc()}")
        return False

def _configure_llm_from_env():
    """(Re)configure DSPy default LLM from environment vars."""
    if not _safe_import_dspy():
        log("Cannot configure LLM - DSPy not available")
        return
        
    model_name = os.getenv("METAKEYAI_LLM")
    if model_name:
        try:
            dspy.settings.lm = dspy.LM(model_name)
            log("DSPy default LLM configured ->", model_name)
        except Exception as e:
            log("Failed to set DSPy default LLM:", e)

# ---------------------------------------------------------------------------
# Spell Discovery
# ---------------------------------------------------------------------------

SPELLS_DIR = Path(__file__).parent / "spells"
SPELL_REGISTRY: Dict[str, Dict[str, Any]] = {}

def _discover_spells():
    """Scan the spells directory and load META info."""
    if not SPELLS_DIR.exists():
        return
    for py_file in sorted(SPELLS_DIR.glob("*.py")):
        if py_file.stem == "__init__":
            continue
        try:
            mod = load_spell_module(str(py_file))
            meta = getattr(mod, "META", {})
            if "id" in meta:
                SPELL_REGISTRY[meta["id"]] = {**meta, "scriptFile": str(py_file)}
        except Exception as e:
            log(f"Failed to load spell {py_file}: {e}")

# ---------------------------------------------------------------------------
# FastAPI App and Endpoints
# ---------------------------------------------------------------------------

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    log("🚀 FastAPI server starting up...")
    _configure_llm_from_env()
    _discover_spells()
    log("✅ Spells discovered and loaded.")
    log(f"http://127.0.0.1:5000/docs for API docs")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/ping")
def ping():
    return "pong"

class SpellCastRequest(BaseModel):
    spellId: str
    # Allow either a script file or inline script content
    scriptFile: Optional[str] = None
    script: Optional[str] = None
    input: Optional[str] = ""

@app.post("/cast")
def cast_spell(payload: SpellCastRequest):
    try:
        script_to_run = payload.scriptFile
        temp_file_path = None

        # If inline script content is provided, write it to a temporary file
        if payload.script:
            temp_file_path = Path(tempfile.gettempdir()) / f"metakeyai_temp_spell_{uuid.uuid4()}.py"
            with open(temp_file_path, "w", encoding="utf-8") as f:
                f.write(payload.script)
            script_to_run = str(temp_file_path)

        if not script_to_run:
            raise ValueError(f"No scriptFile or script content provided for spell {payload.spellId}")

        input_text = payload.input

        start = time.time()
        original_stdin = sys.stdin
        original_stdout = sys.stdout
        if input_text:
            sys.stdin = io.StringIO(input_text)
        
        sys.stdout = captured_stdout = io.StringIO()

        try:
            mod = load_spell_module(script_to_run)
            if hasattr(mod, "main"):
                result = mod.main(input_text)
            else:
                ns = {"__name__": "__spell__", "INPUT_TEXT": input_text, "dspy": dspy, "sys": sys}
                runpy.run_path(script_to_run, init_globals=ns)
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
            # Clean up the temporary file if one was created
            if temp_file_path:
                os.remove(temp_file_path)

        return {
            "spellId": payload.spellId,
            "success": success,
            "output": result,
            "executionTime": int((time.time() - start) * 1000),
            "error": error_msg,
        }
    except Exception as e:
        log(f"Error casting spell: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/spells")
def list_spells():
    return list(SPELL_REGISTRY.values())

class EnvUpdateRequest(BaseModel):
    env: Dict[str, str]

@app.post("/env")
def update_env(payload: EnvUpdateRequest):
    try:
        for k, v in payload.env.items():
            os.environ[str(k)] = str(v)
        _configure_llm_from_env()

        ok = False
        msg = ""
        if _safe_import_dspy():
            try:
                model_str = os.getenv("METAKEYAI_LLM", "")
                if model_str:
                    tmp_lm = dspy.LM(model_str)
                    test_out = tmp_lm("Hello")
                    ok = len(test_out) > 0
            except Exception as e:
                msg = str(e)
        else:
            msg = dspy_import_error or "DSPy not available"
        return {"updated": list(payload.env.keys()), "ok": ok, "msg": msg}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class QuickEditRequest(BaseModel):
    text: str

@app.post("/quick_edit")
def quick_edit(payload: QuickEditRequest):
    text = payload.text
    if not text:
        return {"result": ""}
    
    if not _safe_import_dspy():
        # Fallback: just return the text uppercased as a simple transformation
        return {"result": text.upper()}

    try:
        lm = getattr(dspy.settings, 'lm', None)
        if lm is None:
            model_str = os.getenv("METAKEYAI_LLM") or "openai/gpt-3.5-turbo"
            lm = dspy.LM(model_str)
            dspy.settings.lm = lm
        
        qedit = dspy.Predict("prompt -> answer", lm=lm)
        improved = qedit(prompt=text).answer
        return {"result": improved.strip()}
    except Exception as e:
        log("quick_edit failed:", e)
        return {"result": text}

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Note: Port is hardcoded to 5000 for simplicity.
    # In a real app, this might be dynamically chosen.
    uvicorn.run(app, host="127.0.0.1", port=5000) 