// quick-validate.js
const { createRuneEtchingScript } = require('./deepseek/generate-script');

function quickValidate(scriptHex) {
    console.log('🔍 Quick validation:');

    // Check if it starts with OP_RETURN (6a)
    if (!scriptHex.startsWith('6a')) {
        console.log('❌ Must start with OP_RETURN (6a)');
        return false;
    }

    // Check if it contains Runes magic bytes (5253 = "RS")
    if (!scriptHex.includes('5253')) {
        console.log('❌ Missing Runes magic bytes (5253)');
        return false;
    }

    // Check reasonable length
    if (scriptHex.length > 200) { // 100 bytes max typically
        console.log('❌ Script too long');
        return false;
    }

    console.log('✅ Basic validation passed');
    return true;
}

// Test your script
const runeScript = createRuneEtchingScript({
    runeName: 'TESTRUNES',
    divisibility: 0
});

quickValidate(runeScript.script);