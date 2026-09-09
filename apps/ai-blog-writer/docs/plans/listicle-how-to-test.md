# Trying the listicle pipeline yourself

Plain instructions. Nothing here spends money unless it says so.

## Start it

    cd apps/ai-blog-writer
    pnpm run dev:local

Two servers come up: the app on **http://localhost:3003** and its backend on
4003. Leave that terminal running.

You will not be asked to log in. The app normally signs in through Payload,
which does not run on this machine, so a development-only switch stands in for
it (`VITE_DEV_OFFLINE_LOGIN=true`, already set in `apps/frontend/.env`). The
header will say "Payload Offline" — that is correct and nothing is wrong.

That switch cannot reach a real build: it is fenced on Vite's `DEV` flag, which
is a build-time literal, and a production build with the flag deliberately
turned on was checked to contain no trace of it.

## Look at a finished run — free

Open one of the two real runs:

- http://localhost:3003/listicle-pipeline/33fca394 — the clean one
- http://localhost:3003/listicle-pipeline/292e71e3 — the earlier one

Reading a stored run costs nothing. What to look at:

**The search order**, near the top. The count, what earns a place, what is left
out, and the seven searches. Under each search is a line saying what it
returned the *last* time it ran — that is the new bit, and it is there so you
can see a search is not worth buying before you buy it.

**"Correct the number"** and **"Correct what earns a place, or what is left
out"**. Both make a new revision rather than editing in place, so results
already gathered still say which request they answered. Safe to click; costs
nothing.

**The results table.** `ONLY THIS` is how many places that search found that no
other search did. On `33fca394` the lunch-hours angle shows 0 — it was paid for
and bought nothing. There is a sentence above saying how many searches ended up
like that.

**The line above the list of places**: nothing has been checked against what
you left out. That is true and it is the biggest gap in the pipeline — the
searches returned eight Nikkei and Japanese restaurants on a list that said "no
places where ceviche is not the primary offering". Nothing catches that yet.

## Start a new one — this spends money

From http://localhost:3003/listicle-pipeline. Type a title, answer the
interview, approve the searches. Roughly one grounded web search per angle,
about seven, plus the interview.

Two rules when answering, both learned the hard way:

- **Answer as a statement, not as a reply.** What you type is stored word for
  word and reaches the searches as your own words. "Yes, that" says nothing.
- **The suggestion in the box is a proposed answer, not part of the question.**
  Read the question, decide what is true, write that.

Nothing searches until you press the button. Opening a page never spends.

## If something looks wrong

The backend prints to the same terminal. Run state lives in
`apps/ai-blog-writer/data/pipeline.db`; copy it before poking at it.

These read stored runs and spend nothing:

    set -a && . ./apps/backend/.env && set +a
    export PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py report <run_id>
    .venv/bin/python apps/backend/scripts/listicle_angle_variance.py
