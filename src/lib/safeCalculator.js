'use strict';

/**
 * A small recursive-descent arithmetic parser.
 *
 * Why not `eval`, or `new Function`? Because the input here comes straight
 * from a WhatsApp message, which in a group means from anyone. `eval` on an
 * attacker-controlled string in a process holding your WhatsApp session is
 * about the worst thing this codebase could do — `.calc process.exit()` is
 * the friendly version, and `.calc require('fs')...` is the other one.
 * Sandboxing eval is famously hard to get right, so this doesn't try: it
 * parses a fixed grammar and can only ever produce a number.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor)*
 *   factor     := unary ('^' factor)?        // right-associative
 *   unary      := ('-' | '+')? primary
 *   primary    := number | name '(' expression ')' | constant | '(' expression ')'
 */

// Null-prototype on purpose. With a normal object literal, FUNCTIONS['constructor']
// resolves up the prototype chain to Object's own constructor, so `.calc
// constructor(1)` sails past the "unknown name" check and actually invokes it.
// It only produced NaN here, but a lookup table fed by user input should never
// be able to return anything nobody put in it.
const FUNCTIONS = Object.assign(Object.create(null), {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
});

const CONSTANTS = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E });

const MAX_INPUT_LENGTH = 200;

class CalcError extends Error {}

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) num += input[i++];
      if ((num.match(/\./g) || []).length > 1) throw new CalcError(`"${num}" isn't a valid number.`);
      tokens.push({ type: 'number', value: Number(num) });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < input.length && /[a-zA-Z]/.test(input[i])) name += input[i++];

      // A lone "x" is how most people type multiplication. It has to be
      // caught here rather than in the operator branch below, because the
      // letter rule above has already consumed it by then.
      if (name.toLowerCase() === 'x') {
        tokens.push({ type: '*' });
        continue;
      }

      tokens.push({ type: 'name', value: name.toLowerCase() });
      continue;
    }

    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }

    // Common typing conveniences, folded into real operators.
    if (ch === '×') {
      tokens.push({ type: '*' });
      i += 1;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ type: '/' });
      i += 1;
      continue;
    }

    throw new CalcError(`I don't understand the character "${ch}".`);
  }

  return tokens;
}

function parse(tokens) {
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => {
    if (!peek() || peek().type !== type) throw new CalcError(`Expected "${type}".`);
    return tokens[pos++];
  };

  function expression() {
    let left = term();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos++].type;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function term() {
    let left = factor();
    while (peek() && ['*', '/', '%'].includes(peek().type)) {
      const op = tokens[pos++].type;
      const right = factor();
      if ((op === '/' || op === '%') && right === 0) throw new CalcError('Division by zero.');
      if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left %= right;
    }
    return left;
  }

  function factor() {
    const base = unary();
    if (peek() && peek().type === '^') {
      pos += 1;
      return base ** factor(); // right-associative: 2^3^2 is 2^9
    }
    return base;
  }

  function unary() {
    if (peek() && peek().type === '-') {
      pos += 1;
      return -unary();
    }
    if (peek() && peek().type === '+') {
      pos += 1;
      return unary();
    }
    return primary();
  }

  function primary() {
    const token = peek();
    if (!token) throw new CalcError('The expression ends unexpectedly.');

    if (token.type === 'number') {
      pos += 1;
      return token.value;
    }

    if (token.type === 'name') {
      pos += 1;
      if (CONSTANTS[token.value] !== undefined) return CONSTANTS[token.value];

      const fn = FUNCTIONS[token.value];
      if (!fn) {
        throw new CalcError(
          `Unknown name "${token.value}". Available: ${[...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)].join(', ')}.`
        );
      }
      eat('(');
      const arg = expression();
      eat(')');
      return fn(arg);
    }

    if (token.type === '(') {
      pos += 1;
      const value = expression();
      eat(')');
      return value;
    }

    throw new CalcError(`Unexpected "${token.type}".`);
  }

  const result = expression();
  if (pos < tokens.length) throw new CalcError('There is leftover text after the expression.');
  return result;
}

/**
 * @returns {number}
 * @throws {CalcError} with a message safe to show the user
 */
function evaluate(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new CalcError('Nothing to calculate.');
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new CalcError(`That expression is too long (limit ${MAX_INPUT_LENGTH} characters).`);
  }

  const result = parse(tokenize(trimmed));

  if (!Number.isFinite(result)) throw new CalcError('That works out to infinity or an undefined value.');
  return result;
}

module.exports = { evaluate, CalcError };
