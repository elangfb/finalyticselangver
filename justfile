# Serve development server
dev:
    corepack pnpm run dev

# Deploy web by push to mirror bot repo
deploy:
    git pull --ff-only
    echo "Last-Commit-Id: $(git log -1 --pretty=format:"%H" -- :!.app-meta)" > .app-meta
    git add .app-meta
    git commit -m 'chore: update app meta'
    git push
    git push --force github.com:luthfisolahudin/arunami-finalytics-web.git main-update:main
