# Distributing the lab via GHCR (instructor guide)

Give students a single `docker-compose.yml` that pulls prebuilt images from the
GitHub Container Registry (`ghcr.io`) — no source code, no build step.

## One-time: push the images

1. **Create a token.** GitHub → Settings → Developer settings → Personal access
   tokens. Either kind works:

   - **Classic:** scope `write:packages` (pulls in `read:packages`). Add
     `delete:packages` only if you want to remove images later.
   - **Fine-grained:** permission **Repository permissions → Packages: Read and
     write** (covers push, pull and delete; *Metadata: Read* is added
     automatically). Set the token's **Resource owner** to the same account as
     `<owner>` in `ghcr.io/<owner>/…` — a user token can't push to an org
     namespace. If `<owner>` is an organization, the org must allow fine-grained
     PATs and may need to approve the token. Repository access can be the linked
     repo or "All repositories".

2. **Log in to GHCR** (`GH_OWNER` = your lowercase GitHub username or org):

   ```bash
   echo "$GHCR_PAT" | docker login ghcr.io -u <your-gh-username> --password-stdin
   ```

3. **Build and push** all five images:

   ```bash
   GH_OWNER=<your-gh-username-or-org> VERSION=1.0 ./deploy/push-images.sh
   ```

   This publishes, under `ghcr.io/<owner>/hslu-ot-grid-web-ctf/`:
   `web`, `scada`, `scada-gate`, `bot`, `collector` — each tagged `1.0` and
   `latest`. (The current published set is at
   `ghcr.io/sirius-a/hslu-ot-grid-web-ctf`, which is what the public compose
   (`deploy/public/`) defaults to.)

4. **Make the packages pullable by students.** New GHCR packages are **private**.
   Pick one:

   - **Public (easiest):** each package page → *Package settings* → *Change
     visibility* → **Public**. Students then `docker pull` with no login.
   - **Private + token:** keep them private and hand students a read-only token,
     or (for an org) grant the class team `read` on the packages. Students run
     `docker login ghcr.io` before `compose pull`.

   Optional: on each package page, *Connect repository* so the package is linked
   to your repo and inherits its access.

## Hand out / publish

Everything players need is in **`deploy/public/`**:

- `README.md` — how to run the challenge from the images
- `docker-compose.yml`
- `.env.example`

These are self-contained and spoiler-free — drop them at the root of a public
repo (e.g. the one hosting the packages), or hand out the folder directly.

The compose already defaults to `ghcr.io/sirius-a/hslu-ot-grid-web-ctf:1.0`, so
players just run:

```bash
# if the packages are private:  docker login ghcr.io
docker compose pull
docker compose up -d
# open http://localhost:8100
```

`.env` is only needed to override the namespace, tag or host ports (see
`.env.example`). If you push under a different owner, change the default in the
compose `image:` lines, or ship a filled `.env` with `REGISTRY` set.

## What's in the images vs. the compose

- **Flags are baked into the images** (stage 1 in the portal, stage 2 in the
  scada image) and are deliberately **not** in the compose — so opening the file
  does not reveal them.
- **The supervisor password is generated per deployment.** When `ADMIN_PASSWORD`
  is unset, the portal randomises it and writes it to a shared volume that only
  the bot reads, so it never appears in the compose and can't be used to skip
  stage 1. `docker compose restart web` rotates it. (Pin `ADMIN_PASSWORD` only
  for debugging.)
- **The FUXA operator account** is FUXA's stock default (`admin`/`123456`), baked
  into the scada image. The stage-2 RCE is unauthenticated, so the challenge
  never needs it and it is not set in the compose.
- `BOT_TOKEN` is a non-secret internal token with a default in the compose; it
  only lets a caller fetch/return review jobs, not read flags or credentials.

## Caveats

- **Self-hosted means the flag lives on the student's machine.** A determined
  student can read a baked flag out of an image layer (`docker history`, or
  extracting the filesystem). That is inherent to any run-it-yourself CTF; the
  exercise is the exploit chain, not flag secrecy. If you need flags that can't
  be extracted locally, you'd have to serve them from a central instance you
  control — out of scope for this hand-out.
- **Rotate flags per cohort** if you care about reuse: set `FLAG` / `FLAG2` at
  build time (edit `web/server/index.js` default and `scada/entrypoint.sh`
  default, or pass them as build args) and push a new `VERSION`.
- **Apple Silicon students:** if you build on amd64 and a student is on an
  arm64 Mac, images run under emulation (slower; the Chromium bot especially).
  To avoid that, build multi-arch once:

  ```bash
  docker buildx create --use
  # per service, e.g. web:
  docker buildx build --platform linux/amd64,linux/arm64 \
    -t ghcr.io/<owner>/hslu-ot-grid-web-ctf/web:1.0 --push ./web
  ```
