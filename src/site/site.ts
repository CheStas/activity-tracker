// The site pages' script: anonymous usage stats (src/analytics.ts) and, on the privacy page, the switch for them. The
// choice is shared with the app (same localStorage).
import { browserOptsOut, setStatsOn, startStats, statsAvailable, statsChoice, statsOn } from '../analytics.ts';

startStats();

const box = document.getElementById('stats-choice');
function showChoice() {
  if (!box) return;
  if (!statsAvailable()) {
    box.textContent = 'This copy of the site sends no usage stats.';
    return;
  }
  const on = statsOn();
  const dnt = !statsChoice() && browserOptsOut() ? ' Your browser asks sites not to track, so they stay off unless you turn them on.' : '';
  box.textContent = `Usage stats are ${on ? 'on' : 'off'} in this browser.${dnt} `;
  const button = document.createElement('button');
  button.className = 'button';
  button.textContent = on ? 'Turn off' : 'Turn on';
  button.onclick = () => {
    setStatsOn(!on);
    showChoice();
  };
  box.append(button);
}
showChoice();
