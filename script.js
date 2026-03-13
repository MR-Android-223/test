let placeholderText =
'اضغط توليد...';

document.getElementById('emailOutput').placeholder = placeholderText;
document.getElementById('passOutput').placeholder = placeholderText;
document.getElementById('userOutput').placeholder = placeholderText;

let selectedDomain = 'gmail.com';
let selectedStyle = 'cool';
let history = JSON.parse(localStorage.getItem('abuFaizHistory')) || [];
let stats = JSON.parse(localStorage.getItem('abuFaizStats')) || { generated: 0, copied: 0 };
let sessionStart = Date.now();

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('totalGenerated').textContent = stats.generated;
  document.getElementById('totalCopied').textContent = stats.copied;
  renderHistory();
});

setInterval(() => {
  const mins = Math.floor((Date.now() - sessionStart) / 60000);
  document.getElementById('sessionTime').textContent = mins + 'm';
}, 10000);

function saveStats() {
  localStorage.setItem('abuFaizStats', JSON.stringify(stats));
}

function selectDomain(btn, domain) {
  document.querySelectorAll('.domain-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedDomain = domain;
}

function selectStyle(btn, style) {
  document.querySelectorAll('.style-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedStyle = style;
}

function toggleOption(el) {
  el.classList.toggle('checked');
  const box = el.querySelector('.toggle-box');
  box.textContent = el.classList.contains('checked') ? '✓' : '';
}

function addRipple(btn, e) {
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const size = Math.max(rect.width, rect.height);
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
}

function showToast(msg, emoji = '✅') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.innerHTML = '<span>' + emoji + '</span> ' + msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function addHistory(value, typeKey) {
  history.unshift({ value: value, type: typeKey, time: new Date().toLocaleTimeString('en-US') });
  if (history.length > 50) history.pop();
  localStorage.setItem('abuFaizHistory', JSON.stringify(history));
  renderHistory();
  stats.generated++;
  document.getElementById('totalGenerated').textContent = stats.generated;
  saveStats();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (history.length === 0) {
    let emptyMsg =
    'لا يوجد سجل بعد...';
    list.innerHTML = '<div class="empty-history">' + emptyMsg + '</div>';
    return;
  }
  
  let htmlResult = '';
  history.forEach((item, i) => {
    let typeStr = '';
    if(item.type === 'email') {
      typeStr =
      'إيميل';
    } else if(item.type === 'pass') {
      typeStr =
      'سر';
    } else {
      typeStr =
      'مستخدم';
    }
    
    htmlResult += `
    <div class="history-item" style="animation-delay:${i*0.03}s">
      <div class="history-value">${item.value}</div>
      <span class="history-badge badge-${item.type}">${typeStr}</span>
      <button class="history-copy" onclick="copyRaw('${item.value.replace(/'/g,"\\'")}')">📋</button>
    </div>
    `;
  });
  list.innerHTML = htmlResult;
}

function askClearHistory() {
  document.getElementById('confirmModal').classList.add('active');
}

function closeModal() {
  document.getElementById('confirmModal').classList.remove('active');
}

function confirmClearHistory() {
  history = [];
  localStorage.removeItem('abuFaizHistory');
  renderHistory();
  closeModal();
  let msgClear =
  'تم مسح السجل بنجاح';
  showToast(msgClear, '🗑️');
}

async function copyRaw(text) {
  try {
    await navigator.clipboard.writeText(text);
    let msgCopied =
    'تم النسخ!';
    showToast(msgCopied);
    stats.copied++;
    document.getElementById('totalCopied').textContent = stats.copied;
    saveStats();
  } catch {}
}

async function copyField(fieldId, btnId) {
  const field = document.getElementById(fieldId);
  if (!field.value) { 
    let msgEmpty =
    'لا يوجد شيء للنسخ';
    showToast(msgEmpty, '⚠️'); 
    return; 
  }
  await copyRaw(field.value);
  const btn = document.getElementById(btnId);
  btn.classList.add('copied');
  btn.querySelector('span').textContent = '✅';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.querySelector('span').textContent = '📋';
  }, 2000);
}

const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function shuffle(str) {
  return str.split('').sort(() => 0.5 - Math.random()).join('');
}

function generateEmail(btn) {
  if (btn) addRipple(btn, event);

  const adjectives = [
    'dark', 'blue', 'fire', 'swift', 'cool', 'epic', 'star', 'nova', 'iron', 'wild', 'sky', 'zen',
    'toxic', 'neon', 'shadow', 'crystal', 'quantum', 'cosmic', 'phantom', 'silent', 'golden',
    'silver', 'crimson', 'emerald', 'sapphire', 'frozen', 'blazing', 'mystic', 'ancient',
    'digital', 'virtual', 'brave', 'bold', 'clever', 'fast', 'super', 'mega', 'ultra', 'hyper',
    'giga', 'alpha', 'omega', 'prime', 'elite', 'supreme', 'royal', 'magic', 'secret', 'hidden',
    'lost', 'last', 'first', 'zero', 'infinite', 'crazy', 'mad', 'smart', 'genius', 'darkness',
    'light', 'heavy', 'rapid', 'sonic', 'atomic', 'nuclear', 'solar', 'lunar', 'stellar',
    'astral', 'chaos', 'order', 'chaos', 'doom', 'glory', 'honor', 'power', 'force', 'energy'
  ];
  
  const nouns = [
    'wolf', 'hawk', 'lion', 'dragon', 'ghost', 'shadow', 'blade', 'storm', 'void', 'pixel', 'cyber', 'nexus',
    'tiger', 'bear', 'eagle', 'falcon', 'shark', 'viper', 'cobra', 'ninja', 'samurai', 'knight', 'wizard',
    'mage', 'hunter', 'ranger', 'rogue', 'thief', 'assassin', 'king', 'queen', 'prince', 'lord', 'god',
    'demon', 'angel', 'spirit', 'soul', 'heart', 'mind', 'brain', 'system', 'network', 'matrix', 'code',
    'data', 'byte', 'bot', 'mech', 'cyborg', 'alien', 'mutant', 'hero', 'villain', 'titan', 'giant', 'beast',
    'monster', 'warrior', 'fighter', 'soldier', 'sniper', 'pilot', 'driver', 'rider', 'racer', 'runner'
  ];

  const patterns = [
    () => rand(adjectives) + rand(nouns) + randInt(10, 9999),
    () => rand(adjectives) + '_' + rand(nouns) + randInt(1, 999),
    () => rand(nouns) + '.' + rand(adjectives) + randInt(10, 9999),
    () => shuffle('abcdefghijklmnopqrstuvwxyz'.substring(0, randInt(5,9))) + randInt(100, 99999),
    () => rand(adjectives) + randInt(10000, 99999),
    () => rand(nouns) + rand(nouns) + randInt(1, 99)
  ];

  const username = rand(patterns)();

  let domain = selectedDomain;
  if (domain === 'random') {
    const domains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'proton.me', 'outlook.com', 'icloud.com', 'mail.com', 'tutanota.com', 'yandex.com', 'zoho.com', 'gmx.com'];
    domain = rand(domains);
  }

  const email = username + '@' + domain;
  const field = document.getElementById('emailOutput');
  field.value = email;
  field.classList.add('has-value');
  addHistory(email, 'email');
  
  let msgGenEmail =
  'تم توليد إيميل جديد! 📧';
  showToast(msgGenEmail);
}

function generatePass(btn) {
  if (btn) addRipple(btn, event);

  const options = document.querySelectorAll('#passOptions .option-toggle');
  const upper = options[0].classList.contains('checked') ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '';
  const lower = options[1].classList.contains('checked') ? 'abcdefghijklmnopqrstuvwxyz' : '';
  const nums  = options[2].classList.contains('checked') ? '0123456789' : '';
  const syms  = options[3].classList.contains('checked') ? '!@#$%^&*()_+-=[]{}|;:,.<>?' : '';

  const all = upper + lower + nums + syms;
  if (!all) { 
    let msgNoType =
    'اختر نوع واحد على الأقل!';
    showToast(msgNoType, '⚠️'); 
    return; 
  }

  const length = parseInt(document.getElementById('passLength').value);
  let pass = '';

  if (upper) pass += rand(upper);
  if (lower) pass += rand(lower);
  if (nums)  pass += rand(nums);
  if (syms)  pass += rand(syms);

  while (pass.length < length) pass += rand(all);
  pass = shuffle(pass);

  const field = document.getElementById('passOutput');
  field.value = pass;
  field.classList.add('has-value');

  updateStrength(pass, upper, lower, nums, syms);
  addHistory(pass, 'pass');
  
  let msgGenPass =
  'تم توليد كلمة سر قوية! 🔐';
  showToast(msgGenPass);
}

function updateStrength(pass, upper, lower, nums, syms) {
  let score = 0;
  if (pass.length >= 12) score += 25;
  if (pass.length >= 20) score += 15;
  if (upper) score += 15;
  if (lower) score += 15;
  if (nums)  score += 15;
  if (syms)  score += 15;

  const fill = document.getElementById('strengthFill');
  const text = document.getElementById('strengthText');

  fill.style.width = score + '%';
  
  let txt1 =
  'ضعيفة ⚠️';
  let txt2 =
  'متوسطة ⚡';
  let txt3 =
  'قوية 💪';
  let txt4 =
  'لا تكسر! 🔥';

  if (score < 40) {
    fill.style.background = '#ff3d71';
    text.style.color = '#ff3d71';
    text.textContent = txt1;
  } else if (score < 70) {
    fill.style.background = '#ffd700';
    text.style.color = '#ffd700';
    text.textContent = txt2;
  } else if (score < 90) {
    fill.style.background = '#00e676';
    text.style.color = '#00e676';
    text.textContent = txt3;
  } else {
    fill.style.background = 'linear-gradient(90deg, #00d4ff, #00e676)';
    text.style.color = '#00d4ff';
    text.textContent = txt4;
  }
}

function generateUsername(btn) {
  if (btn) addRipple(btn, event);

  const styles = {
    cool: [
      () => ['dark','epic','ultra','hyper','neo','alpha','omega','meta','cyber','neon','quantum','cosmic','astral','void','flux'][randInt(0,14)] + ['Wolf','Hawk','Fox','Viper','Ghost','Blade','Storm','Nexus','Core','Void','Pulse','Spark','Flare','Sync','Grid'][randInt(0,14)],
      () => 'x_' + ['hunter','sniper','driv3r','coderr','hack3r','nod3r','kill3r','slay3r','play3r','gam3r','mast3r','lord','king','boss'][randInt(0,13)] + '_x',
      () => ['shadow','phantom','spectr','cipher','zenith','apex','vortex','matrix','system','logic','pixel','byte'][randInt(0,11)] + randInt(100,9999),
      () => ['TheReal','Just','Only','True','Pure','Absolute','Infinite'][randInt(0,6)] + ['Legend','Myth','Icon','Hero','Champ','Star'][randInt(0,5)] + randInt(1,99)
    ],
    gamer: [
      () => ['xX','XX','gg','Ez','Pro','God'][randInt(0,5)] + ['Noob','Killer','Sniper','Boss','Slayer','Hunter','Beast','Titan','Ninja','Samurai','Demon','Dragon'][randInt(0,11)] + ['Xx','XX','_YT','_TV','TTV'][randInt(0,4)],
      () => ['ProPlayer','MLGpro','TopFrag','AceKill','OneShot','HeadShot','Clutch','Carry','Rush','Camp','Loot'][randInt(0,10)] + randInt(100,9999),
      () => ['N3on','Ph4ntom','Vip3r','Gh0st','Fr0st','Bl4ze','Ven0m','T0xic','H4v0c','R3c0n'][randInt(0,9)] + '_' + ['GG','YT','TV','PRO','GOD','MVP'][randInt(0,5)],
      () => ['FaZe_','OpTic_','TSM_','C9_','G2_','Navi_'][randInt(0,5)] + ['Aim','Flick','Spray','Peek','Push'][randInt(0,4)] + randInt(1,99)
    ],
    pro: [
      () => ['Alex','Ryan','Sam','Kyle','Drew','Max','John','Mike','Chris','David','James','Tom'][randInt(0,11)] + ['Dev','Tech','Pro','Hub','Lab','Studio','Code','Web','App','Net'][randInt(0,9)] + randInt(10,999),
      () => ['the','mr_','sir_','dr_','real_'][randInt(0,4)] + ['dev','coder','builder','maker','creator','founder','admin','root','sys','hacker'][randInt(0,9)],
      () => ['dev','tech','code','build','stack','data','cloud'][randInt(0,6)] + ['_' + ['io','hub','xyz','app','co','net','org'][randInt(0,6)]],
      () => ['Code','Byte','Bit','Data','Logic','Loop','Node','Script'][randInt(0,7)] + ['Master','Ninja','Guru','Wizard','Jedi','Geek'][randInt(0,5)] + randInt(1,99)
    ],
    arabic: [
      () => ['abu','om','bnt','ibn','akh','okht'][randInt(0,5)] + '_' + ['faiz','nour','ali','sara','reem','lara','ahmad','omar','tariq','rami','sami','fadi'][randInt(0,11)] + randInt(0,999),
      () => ['alqamar','alnoor','alsayf','alward','albadr','alahly','alshams','alnajm','alfajer','allayl','alassad','alnimr'][randInt(0,11)] + randInt(10,9999),
      () => ['malik','amir','batal','qaid','nokhba','zaeem','sheikh','pasha','bek','muallem','ostaz','wahsh'][randInt(0,11)] + '_' + randInt(100,9999),
      () => ['Syrian','Sham','Halabi','Homsi','Dimashqi','Arab'][randInt(0,5)] + ['King','Prince','Boss','Pro','Gamer'][randInt(0,4)] + randInt(1,99)
    ],
    random: null,
  };

  let username;
  if (selectedStyle === 'random') {
    const allStyles = Object.values(styles).filter(s => s);
    const picked = rand(allStyles);
    username = rand(picked)();
  } else {
    username = rand(styles[selectedStyle])();
  }

  const field = document.getElementById('userOutput');
  field.value = username;
  field.classList.add('has-value');
  addHistory(username, 'user');
  
  let msgGenUser =
  'تم توليد اسم مستخدم! ✨';
  showToast(msgGenUser);
}