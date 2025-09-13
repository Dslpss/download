#!/usr/bin/env bash
if [ -f .venv/Scripts/activate ]; then
  source .venv/Scripts/activate
fi
python -m src.videodl.main
