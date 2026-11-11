import {describe,it,expect} from 'vitest';
const MIN=100n,MAX=100000000000n;
function validAmount(s:string){if(!/^\d+$/.test(s))return false;const n=BigInt(s);return n>=MIN&&n<=MAX;}
describe('INR paise validation',()=>{it('accepts ₹1 and ₹100 crore',()=>{expect(validAmount('100')).toBe(true);expect(validAmount('100000000000')).toBe(true);});it('rejects zero, below minimum and above maximum',()=>{expect(validAmount('0')).toBe(false);expect(validAmount('99')).toBe(false);expect(validAmount('100000000001')).toBe(false);});it('rejects decimal and exponent formats',()=>{expect(validAmount('100.00')).toBe(false);expect(validAmount('1e4')).toBe(false);});});
