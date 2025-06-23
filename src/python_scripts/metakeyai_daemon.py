#!/usr/bin/env python3
"""
MetaKeyAI background Python daemon
---------------------------------
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
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# ---------------------------------------------------------------------------
# Constants and Globals
# ---------------------------------------------------------------------------
PORT = int(os.getenv("METAKEYAI_PORT", "5000"))
SPELL_CACHE: Dict[str, types.ModuleType] = {}

# ---------------------------------------------------------------------------
# Helpers (logging to stderr)
# ---------------------------------------------------------------------------

def log(*args, **kwargs):
    """Print to stderr so stdout stays clean for server logs."""
    print(*args, file=sys.stderr, **kwargs)

# ---------------------------------------------------------------------------
# LLM / ENV management
# ---------------------------------------------------------------------------

# Try to import dspy, but don't fail if it's not there.
try:
    import dspy
    log("✅ dspy-ai package found.")
except ImportError:
    dspy = None
    log("⚠️ dspy-ai package not found. AI features will be limited.")

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
    if dspy:
        try:
            # Only configure if the LM is not already set
            if getattr(dspy.settings, 'lm', None) is None:
                model_str = os.getenv('METAKEYAI_LLM')

                # Also check for other common provider keys if needed in future
                # e.g., anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')

                if model_str:
                    log(f"Configuring default LLM for spells: {model_str}")
                    dspy.configure(lm=dspy.LM(model_str))
                else:
                    log("⚠️ Skipping LLM configuration for spells (model or key not set).")
        except Exception as _e:
            log(f"Failed to configure dspy LLM for spell, AI features may be limited: {_e}")
        module.__dict__['dspy'] = dspy

    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore
    return module

# ---------------------------------------------------------------------------
# LLM / ENV management
# ---------------------------------------------------------------------------

# More robust DSPy import handling for PyInstaller
dspy_import_error = None

def safe_import_dspy():
    """Safely import dspy with detailed error handling."""
    if dspy:
        return dspy
    return None

def _configure_llm_from_env():
    """(Re)configure DSPy default LLM from environment vars."""
    if not dspy:
        log("Cannot configure LLM - DSPy not available")
        return
        
    model_name = os.getenv("METAKEYAI_LLM")
    if model_name:
        try:
            dspy.configure(lm=dspy.LM(model_name))
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

# App setup
# Use a lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Server startup logic."""
    log("🚀 FastAPI server starting up...")
    try:
        _configure_llm_from_env()
        _discover_spells()
        log("✅ Spells discovered and loaded.")
        log(f"http://127.0.0.1:{PORT}/docs for API docs")
    except Exception as e:
        log("❌ Error during startup:", e)
    
    yield
    
    # Code below runs on shutdown
    log("🔌 FastAPI server shutting down.")

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0", "dspy_available": bool(dspy) }

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
        if safe_import_dspy():
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
        return {"result": "not text found"}
    
    if not dspy:
        # Fallback: just return the text uppercased as a simple transformation
        return {"result": "DSPy not available"}

    try:
             
        qedit = dspy.Predict("prompt -> answer")
        improved = qedit(prompt=text).answer
        return {"result": improved.strip()}
    except Exception as e:
        log("quick_edit failed:", e)
        return {"result": text}

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    log(f"🚀 Starting FastAPI server on port {PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT) 