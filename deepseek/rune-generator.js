const bitcoin = require('bitcoinjs-lib');

// Runes protocol constants
const RUNES_MAGIC = Buffer.from([0x52, 0x53]); // "RS"
const RUNES_PROTOCOL_ID = 0x00;

// Field tags for rune etching
const TAGS = {
    RUNE: 4,
    DIVISIBILITY: 1,
    SYMBOL: 5,
    PREMINE: 6,
    CAP: 8,
    AMOUNT: 10,
    HEIGHT_START: 12,
    HEIGHT_END: 14,
    OFFSET_START: 16,
    OFFSET_END: 18,
    POINTER: 22
};

/**
 * Encode a number as LEB128 varint
 */
function encodeLEB128(value) {
    const result = [];
    let num = BigInt(value);

    while (num >= 0x80n) {
        result.push(Number(num & 0x7fn) | 0x80);
        num >>= 7n;
    }
    result.push(Number(num & 0x7fn));

    return Buffer.from(result);
}

/**
 * Encode rune name to number
 */
function encodeRuneName(name) {
    let value = 0n;
    for (let i = 0; i < name.length; i++) {
        const char = name.charCodeAt(i);
        if (char < 65 || char > 90) {
            throw new Error('Rune name must contain only A-Z characters');
        }
        value = value * 26n + BigInt(char - 65);
    }
    return value;
}

/**
 * Validate user input for rune etching
 */
function validateRuneInput(input) {
    const errors = [];

    if (!input.runeName || input.runeName.length === 0) {
        errors.push('Rune name is required');
    } else if (input.runeName.length > 26) {
        errors.push('Rune name must be 1-26 characters');
    } else if (!/^[A-Z]+$/.test(input.runeName)) {
        errors.push('Rune name must contain only A-Z characters');
    }

    if (input.divisibility < 0 || input.divisibility > 38) {
        errors.push('Divisibility must be 0-38');
    }

    if (input.symbol && input.symbol.length > 1) {
        errors.push('Symbol must be a single character');
    }

    // Validate numeric fields
    const numericFields = ['premine', 'cap', 'amount', 'heightStart', 'heightEnd', 'offsetStart', 'offsetEnd', 'pointer'];
    numericFields.forEach(field => {
        if (input[field] !== undefined && input[field] !== null && input[field] < 0) {
            errors.push(`${field} cannot be negative`);
        }
    });

    return errors;
}

/**
 * Create rune etching OP_RETURN script from user input
 */
function createRuneEtchingScript(userInput) {
    // Default values
    const input = {
        runeName: '',
        divisibility: 0,
        symbol: '',
        premine: 0n,
        cap: 0n,
        amount: 0n,
        heightStart: 0,
        heightEnd: 0,
        offsetStart: 0,
        offsetEnd: 0,
        pointer: 0,
        ...userInput
    };

    // Convert string numbers to BigInt/Number
    if (typeof input.premine === 'string') input.premine = BigInt(input.premine) || 0n;
    if (typeof input.cap === 'string') input.cap = BigInt(input.cap) || 0n;
    if (typeof input.amount === 'string') input.amount = BigInt(input.amount) || 0n;
    if (typeof input.divisibility === 'string') input.divisibility = parseInt(input.divisibility) || 0;
    if (typeof input.heightStart === 'string') input.heightStart = parseInt(input.heightStart) || 0;
    if (typeof input.heightEnd === 'string') input.heightEnd = parseInt(input.heightEnd) || 0;
    if (typeof input.offsetStart === 'string') input.offsetStart = parseInt(input.offsetStart) || 0;
    if (typeof input.offsetEnd === 'string') input.offsetEnd = parseInt(input.offsetEnd) || 0;
    if (typeof input.pointer === 'string') input.pointer = parseInt(input.pointer) || 0;

    // Validate input
    const validationErrors = validateRuneInput(input);
    if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    // Build the payload
    const payload = [];

    // Add rune name (required)
    const runeValue = encodeRuneName(input.runeName);
    payload.push(...encodeLEB128(TAGS.RUNE));
    payload.push(...encodeLEB128(runeValue));

    // Add divisibility if specified
    if (input.divisibility > 0) {
        payload.push(...encodeLEB128(TAGS.DIVISIBILITY));
        payload.push(...encodeLEB128(input.divisibility));
    }

    // Add symbol if specified
    if (input.symbol) {
        const symbolCode = input.symbol.codePointAt(0);
        payload.push(...encodeLEB128(TAGS.SYMBOL));
        payload.push(...encodeLEB128(symbolCode));
    }

    // Add premine if specified
    if (input.premine > 0n) {
        payload.push(...encodeLEB128(TAGS.PREMINE));
        payload.push(...encodeLEB128(input.premine));
    }

    // Add mint terms if specified
    if (input.cap > 0n || input.amount > 0n) {
        if (input.cap > 0n) {
            payload.push(...encodeLEB128(TAGS.CAP));
            payload.push(...encodeLEB128(input.cap));
        }
        if (input.amount > 0n) {
            payload.push(...encodeLEB128(TAGS.AMOUNT));
            payload.push(...encodeLEB128(input.amount));
        }
    }

    // Add height constraints if specified
    if (input.heightStart > 0) {
        payload.push(...encodeLEB128(TAGS.HEIGHT_START));
        payload.push(...encodeLEB128(input.heightStart));
    }
    if (input.heightEnd > 0) {
        payload.push(...encodeLEB128(TAGS.HEIGHT_END));
        payload.push(...encodeLEB128(input.heightEnd));
    }

    // Add offset constraints if specified
    if (input.offsetStart > 0) {
        payload.push(...encodeLEB128(TAGS.OFFSET_START));
        payload.push(...encodeLEB128(input.offsetStart));
    }
    if (input.offsetEnd > 0) {
        payload.push(...encodeLEB128(TAGS.OFFSET_END));
        payload.push(...encodeLEB128(input.offsetEnd));
    }

    // Add pointer if specified
    if (input.pointer > 0) {
        payload.push(...encodeLEB128(TAGS.POINTER));
        payload.push(...encodeLEB128(input.pointer));
    }

    // Build the complete OP_RETURN script
    const scriptData = Buffer.concat([
        RUNES_MAGIC,
        Buffer.from([RUNES_PROTOCOL_ID]),
        Buffer.from(payload)
    ]);

    // Create OP_RETURN script
    const script = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        scriptData
    ]);

    return {
        script: script.toString('hex'),
        scriptData: scriptData.toString('hex'),
        payload: Buffer.from(payload).toString('hex'),
        length: script.length,
        runeName: input.runeName,
        details: {
            divisibility: input.divisibility,
            symbol: input.symbol,
            premine: input.premine.toString(),
            cap: input.cap.toString(),
            amount: input.amount.toString(),
            heightStart: input.heightStart,
            heightEnd: input.heightEnd,
            offsetStart: input.offsetStart,
            offsetEnd: input.offsetEnd,
            pointer: input.pointer
        }
    };
}

// Example usage
function example() {
    try {
        const userInput = {
            runeName: 'GAUS',
            divisibility: 2,
            symbol: '⚡',
            premine: '1000000',
            cap: '10000',
            amount: '1000',
            heightStart: 840000,
            heightEnd: 850000
        };

        const result = createRuneEtchingScript(userInput);

        console.log('✅ Rune Script Generated Successfully!');
        console.log('Rune Name:', result.runeName);
        console.log('Script Hex:', result.script);
        console.log('Script Length:', result.length, 'bytes');
        console.log('Details:', result.details);

        return result;

    } catch (error) {
        console.error('❌ Error:', error.message);
        return { error: error.message };
    }
}

// Export the main function
module.exports = {
    createRuneEtchingScript,
    validateRuneInput,
    example
};

// Run example if called directly
if (require.main === module) {
    example();
}