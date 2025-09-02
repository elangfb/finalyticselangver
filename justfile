# Serve development server
dev:
    corepack pnpm run dev

# Push web subplit to mirror bot repo
sync-web-split:
    git push --force noeffort-bot.github.com:noeffort-bot/arunami-finalytics-web-next.git main-update:main
