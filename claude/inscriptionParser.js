// inscriptionParser.js
const { Script } = require('@scure/btc-signer');

function hexToBytes(hex) {
    const length = hex.length / 2;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function hexToString(hex) {
    const bytes = hexToBytes(hex);
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
}

function hexToInt(hex) {
    return parseInt(hex, 16);
}

const typesMap = {
    "text/plain;charset=utf-8": "text",
    "text/plain": "text",
};

function parseBitcoinInscriptionData(data) {
    let type = "unknown";
    let inscriptionData = "";

    if (data.startsWith("63036f7264")) { // "OP_IF OP_PUSH ord"
        const bytes = hexToBytes(data);

        // Decode the script
        const script = Script.decode(bytes);
        console.log('Decoded script:', script);

        // The script should contain pushes for type and content
        const typeBytes = script[3];
        const typeString = hexToString(
            Array.from(typeBytes).map(b => b.toString(16).padStart(2, '0')).join('')
        );
        type = typesMap[typeString] || "unknown";

        const contentBytes = script[5];
        inscriptionData = hexToString(
            Array.from(contentBytes).map(b => b.toString(16).padStart(2, '0')).join('')
        );

        console.log('Final content:', inscriptionData);

    } else if (data.includes(":")) {
        const [typeStr, ...contentParts] = data.split(":");
        type = typeStr;
        inscriptionData = contentParts.join(":");
    }

    return { type, inscriptionData };
}

//Run from CLI
if (require.main === module) {
    const input = process.argv[2];
    if (!input) {
        console.error("Usage: node inscriptionParser.js <hexstring-or-type:content>");
        process.exit(1);
    }
    const result = parseBitcoinInscriptionData(input);
    console.log("Parsed inscription:", result);
}

let result = parseBitcoinInscriptionData("636f72640118746578742f706c61696e3b636861727365743d7574662d380048656c6c6f20426974636f696e204f7264696e616c732066726f6d204e6f64652e6a73210a68");
console.log("Result:", result);

module.exports = { parseBitcoinInscriptionData, hexToString, hexToBytes, hexToInt };
