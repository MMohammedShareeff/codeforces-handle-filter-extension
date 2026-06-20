chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("codeforces.com")
  ) {
    chrome.storage.sync.get("cfFilterState", (res) => {
      if (!res.cfFilterState) return;
      const s = res.cfFilterState;
      const activeList =
        s.activeListId && s.lists ? s.lists[s.activeListId] : null;

      chrome.tabs
        .sendMessage(tabId, {
          type: "CF_FILTER_UPDATE",
          filterOn: s.filterOn || false,
          handles: activeList && s.filterOn ? activeList.handles : [],
          settings: s.settings || { highlight: true, hide: false, badge: true },
        })
        .catch(() => {});
    });
  }
});
