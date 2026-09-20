# STANDING RULES

- reference/ is my friend's project. It is READ-ONLY: never edit, install into, or commit it. Use it only for ideas. Port ideas, not files. If you adapt substantial logic, add a comment "approach adapted from p2-birders (MIT)" and list it in a NOTICE section of the README.
- Keep my architecture: vanilla JS + Vite, three packages (writer, reader, shared), and the DBIR binary envelope (magic "DBIR" + uint16 version + uint32 length + JSON). No React/TypeScript migration. Records already on Swarm (e.g. d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4) must still decode. New fields must be optional and additive.
- The reader may import only bee-js and /shared, never anything from /writer.
- No secrets, keys, mnemonics, gift codes or authenticated URLs in any tracked file.
- Don't change dependency versions, the format, or start the journal/feed feature without asking me first.
- Verify by reading code, types in node_modules, and running tests. Never assume an API exists.
- Do NOT commit or push. Leave changes uncommitted so I can review with git diff.
- I'm on Windows: handle path separators and CRLF in any script.
- Work one step at a time, run npm test after each, and stop and summarise (what changed, why, test count) before moving on.