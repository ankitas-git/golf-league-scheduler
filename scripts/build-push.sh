#!/usr/bin/env bash
#
# Builds and pushes the app image from this machine. Same approach as rfp-filler.
# The cluster is arm64 and so is an Apple silicon laptop, so the build is native.
#
#   ./scripts/build-push.sh 0.1.0    tag an explicit version
#   ./scripts/build-push.sh          use the current short sha
#
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-$(git rev-parse --short=8 HEAD)}"
IMAGE="registry.gitlab.com/syllc/golf-scheduler/app"
TARGET_ARCH="arm64"

if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: working tree is dirty, the image will not match any commit"
  echo
fi

echo "==> building app:$TAG"
docker build --quiet -t "$IMAGE:$TAG" . >/dev/null

# The wrong architecture crashloops in a way that looks like an app bug, so refuse to push it.
arch="$(docker image inspect "$IMAGE:$TAG" --format '{{.Architecture}}')"
if [ "$arch" != "$TARGET_ARCH" ]; then
  echo "built as $arch, the cluster needs $TARGET_ARCH. refusing to push."
  exit 1
fi

echo "==> pushing"
if ! docker push --quiet "$IMAGE:$TAG"; then
  echo "push failed. if you are not logged in, run: docker login registry.gitlab.com"
  exit 1
fi

echo
echo "pushed app:$TAG"
echo "now bump both image refs in the platform repo:"
echo "  k8s-core/golf-scheduler/base/deployment.yaml"
