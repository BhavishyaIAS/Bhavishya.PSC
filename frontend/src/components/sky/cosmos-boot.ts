/**
 * The Sky look's opening (Creation.tsx) decides, before the first paint, whether it plays, so the home page never
 * flashes up and then hides. Read by an inline <script> at the top of the Sky home page:
 *   full    first visit: the whole creation sequence (about 15 s, skippable)
 *   short   a returning visitor: a short version (about 4.5 s)
 *   still   reduced motion (the system setting, or "Animations: off"): a short fade, nothing moving
 *   (none)  already seen in this tab: straight to the home page, the cosmos evolving behind it
 * A safety timer shows the page whatever happens to the script that plays it.
 */
export const COSMOS_SEEN = "bp_cosmos_seen"; // localStorage: the sequence has been seen once
export const COSMOS_SESSION = "bp_cosmos"; // sessionStorage: seen in this tab, do not play again

export const COSMOS_BOOT = `(function(){try{var d=document.documentElement;if(d.dataset.skin!=="sky"||sessionStorage.getItem("${COSMOS_SESSION}"))return;var still=matchMedia("(prefers-reduced-motion: reduce)").matches||d.dataset.motion==="off";d.dataset.intro=still?"still":(localStorage.getItem("${COSMOS_SEEN}")?"short":"full");setTimeout(function(){var m=d.dataset.intro;if(m==="full"||m==="short"){delete d.dataset.intro;delete d.dataset.introName}},24000)}catch(e){}})();`;
