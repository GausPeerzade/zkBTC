const { createRuneEtchingScript } = require('../rune-generator');
const fs = require('fs');

// Generate your test script
const runeScript = createRuneEtchingScript({
    runeName: 'TESTRUNES',
    divisibility: 0,
    symbol: '⚡',
    premine: '1000'
});

console.log('✅ Script generated:');
console.log(runeScript.script);

// Save to file for ord to use
fs.writeFileSync('my-rune-script.txt', runeScript.script);
console.log('📁 Script saved to: my-rune-script.txt');