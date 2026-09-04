# AssistQ Apps Script JSON response fix

Fixed the per-client Apps Script so Claude structured responses are normalised before returning to the AssistQ widget.

The script now handles nested `json` envelopes, object-valued `reply`, fenced JSON, and JSON with harmless surrounding text. The chatbot HTML files also defensively normalise the reply so raw JSON cannot be displayed to visitors.
