// Runs on supported pages. Tells background this tab is a repo page.
chrome.runtime.sendMessage({ type: 'REPO_PAGE' }).catch(() => {});
