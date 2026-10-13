# Library listener lifecycle cleanup

Ordinary development fix on 1.1.99. Both library views retain named pagehide/beforeunload handlers and remove their own listeners during idempotent destruction; prompt controller disposal now notifies the view. Multi-instance cleanup is isolated. Persisted pagehide keeps BFCache behavior; non-persisted pagehide releases the relevant listeners.

This addresses retained listener resources, not an observed data-corruption defect. No storage format, permissions or version change. Frozen implementation validation passed strict serial Node 2548/2548 and Python 81/81; the 112-file offline runtime package passed verification. Regression coverage uses real multi-listener Sets, exact removal, repeated disposal and live backend write counts.

Native browser validation is pending. Listener counts, multi-instance ownership and lifecycle race combinations remain deterministic synthetic evidence; do not infer native BFCache coverage from ordinary reload or UI smoke.
