// Auto-fit player name utility functions
export function fitPlayerName(el: HTMLElement, fullName: string) {
  if (!el) return;
  
  el.style.setProperty("-webkit-line-clamp", "2");
  el.textContent = fullName;

  const overflows = () => el.scrollHeight > el.clientHeight + 1;

  if (overflows()) {
    const parts = fullName.trim().split(/\s+/);
    const suffixes = new Set(["Jr.", "Sr.", "II", "III", "IV", "V"]);
    const first = parts.shift() ?? "";
    let last = parts.join(" ");
    let suf = "";

    const tokens = last.split(" ");
    if (tokens.length && suffixes.has(tokens[tokens.length - 1])) {
      suf = " " + tokens.pop();
      last = tokens.join(" ");
    }
    
    el.style.setProperty("-webkit-line-clamp", "1");
    el.textContent = `${first[0] || ""}. ${last}${suf}`;
  }

  el.setAttribute("title", fullName);
  el.setAttribute("aria-label", fullName);
}