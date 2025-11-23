# GitHub Repository Setup Guide

## Initial Setup

1. **Initialize Git repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: SmartPage Toolbox Chrome extension"
   ```

2. **Connect to GitHub**:
   ```bash
   git remote add origin https://github.com/wveck/smartpage-toolbox.git
   git branch -M main
   git push -u origin main
   ```

## Enable GitHub Pages for Privacy Policy

1. Go to your repository: https://github.com/wveck/smartpage-toolbox
2. Click **Settings** → **Pages**
3. Under "Source", select **Deploy from a branch**
4. Choose branch: **main**
5. Choose folder: **/docs**
6. Click **Save**

Your privacy policy will be available at:
**https://wveck.github.io/smartpage-toolbox/PRIVACY_POLICY.html**

## Use This URL in Chrome Web Store

When filling out the Chrome Web Store privacy form, use:
```
https://wveck.github.io/smartpage-toolbox/PRIVACY_POLICY.html
```

## Updating Files

After making changes:
```bash
git add .
git commit -m "Description of changes"
git push
```

The privacy policy will automatically update on GitHub Pages.

