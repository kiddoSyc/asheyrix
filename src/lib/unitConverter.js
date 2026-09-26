'use strict';

class ConversionError extends Error {}

/**
 * Unit conversion by way of a base unit per category: every unit declares
 * how many base units it is worth, so any pair inside a category converts
 * with one multiply and one divide. Temperature is the exception —
 * offsets mean it needs its own functions.
 */
const CATEGORIES = {
  length: {
    base: 'm',
    partner: 'ft',
    units: {
      mm: 0.001, cm: 0.01, m: 1, km: 1000,
      in: 0.0254, inch: 0.0254, inches: 0.0254,
      ft: 0.3048, foot: 0.3048, feet: 0.3048,
      yd: 0.9144, yard: 0.9144, yards: 0.9144,
      mi: 1609.344, mile: 1609.344, miles: 1609.344,
      nmi: 1852,
    },
  },
  weight: {
    base: 'kg',
    partner: 'lb',
    units: {
      mg: 0.000001, g: 0.001, kg: 1, t: 1000, tonne: 1000,
      oz: 0.0283495, ounce: 0.0283495,
      lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592,
      st: 6.35029, stone: 6.35029,
    },
  },
  data: {
    base: 'mb',
    partner: 'gb',
    // Decimal (1000-based) throughout, so kb->mb->gb stay consistent with
    // each other and with how storage is usually advertised.
    units: {
      b: 0.000001, kb: 0.001, mb: 1, gb: 1000, tb: 1000000,
    },
  },
  time: {
    base: 's',
    partner: 'min',
    units: {
      ms: 0.001, s: 1, sec: 1, second: 1, seconds: 1,
      min: 60, minute: 60, minutes: 60,
      h: 3600, hr: 3600, hour: 3600, hours: 3600,
      d: 86400, day: 86400, days: 86400,
      week: 604800, weeks: 604800,
      year: 31557600, years: 31557600,
    },
  },
  speed: {
    base: 'kmh',
    partner: 'mph',
    units: {
      kmh: 1, kph: 1, mph: 1.609344, ms: 3.6, knot: 1.852, knots: 1.852,
    },
  },
};

const TEMPERATURE = {
  c: { celsius: (v) => v, name: 'C' },
  celsius: { celsius: (v) => v, name: 'C' },
  f: { celsius: (v) => ((v - 32) * 5) / 9, name: 'F' },
  fahrenheit: { celsius: (v) => ((v - 32) * 5) / 9, name: 'F' },
  k: { celsius: (v) => v - 273.15, name: 'K' },
  kelvin: { celsius: (v) => v - 273.15, name: 'K' },
};

const FROM_CELSIUS = {
  c: (v) => v,
  celsius: (v) => v,
  f: (v) => (v * 9) / 5 + 32,
  fahrenheit: (v) => (v * 9) / 5 + 32,
  k: (v) => v + 273.15,
  kelvin: (v) => v + 273.15,
};

function findCategory(unit) {
  for (const [name, category] of Object.entries(CATEGORIES)) {
    if (Object.prototype.hasOwnProperty.call(category.units, unit)) return { name, category };
  }
  return null;
}

function pretty(value) {
  if (!Number.isFinite(value)) throw new ConversionError('That works out to an impossible number.');
  const rounded = Number(value.toPrecision(10));
  return Number.isInteger(rounded) ? String(rounded) : String(Number(rounded.toFixed(4)));
}

/**
 * Accepts the raw argument list, e.g. ['10','km','to','miles'] or
 * ['72','f']. Without a target unit it picks a sensible partner (metric
 * <-> imperial, C <-> F).
 */
function convert(args) {
  const words = args.map((a) => String(a).toLowerCase().trim()).filter((a) => a && a !== 'to' && a !== 'in');

  const value = Number(words[0]);
  if (!Number.isFinite(value)) throw new ConversionError('Start with a number, e.g. "10 km to miles".');

  const from = words[1];
  const to = words[2];
  if (!from) throw new ConversionError('Tell me what unit that is, e.g. "10 km".');

  // Temperature first — its conversions aren't simple ratios.
  if (TEMPERATURE[from]) {
    const target = to && FROM_CELSIUS[to] ? to : from === 'c' || from === 'celsius' ? 'f' : 'c';
    if (!FROM_CELSIUS[target]) throw new ConversionError(`I don't know the temperature unit "${to}".`);
    const celsius = TEMPERATURE[from].celsius(value);
    return `🌡️ ${value}°${TEMPERATURE[from].name} = *${pretty(FROM_CELSIUS[target](celsius))}°${TEMPERATURE[target].name}*`;
  }

  const found = findCategory(from);
  if (!found) throw new ConversionError(`I don't know the unit "${from}".`);

  let target = to;
  if (!target) {
    // Without an explicit target, convert to the category's base unit —
    // unless they already gave the base unit, in which case flip to that
    // category's usual counterpart (m -> ft, kg -> lb).
    target = found.category.base === from ? found.category.partner : found.category.base;
  }

  if (!Object.prototype.hasOwnProperty.call(found.category.units, target)) {
    throw new ConversionError(`I can't convert ${from} to "${target}" — different kinds of unit.`);
  }

  const result = (value * found.category.units[from]) / found.category.units[target];
  return `📐 ${value} ${from} = *${pretty(result)} ${target}*`;
}

function listUnits() {
  return [...Object.keys(CATEGORIES), 'temperature'].join(', ');
}

module.exports = { convert, listUnits, ConversionError };
