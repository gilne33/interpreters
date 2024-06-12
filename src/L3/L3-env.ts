// ========================================================
// Environment data type for L3
import { Value } from './L3-value';
import { Result, makeFailure, makeOk } from '../shared/result';

export type Env = EmptyEnv | NonEmptyEnv; 
export type EmptyEnv = {tag: "EmptyEnv" }
export type NonEmptyEnv = { // binding and pointer to the next
    tag: "Env";
    var: string;
    val: Value;
    nextEnv: Env;
}
export const makeEmptyEnv = (): EmptyEnv => ({tag: "EmptyEnv"});
export const makeEnv = (v: string, val: Value, env: Env): NonEmptyEnv => // get binding and env and make new env wit hpointer to the current env
    ({tag: "Env", var: v, val: val, nextEnv: env});
export const isEmptyEnv = (x: any): x is EmptyEnv => x.tag === "EmptyEnv";
export const isNonEmptyEnv = (x: any): x is NonEmptyEnv => x.tag === "Env";
export const isEnv = (x: any): x is Env => isEmptyEnv(x) || isNonEmptyEnv(x);

export const applyEnv = (env: Env, v: string): Result<Value> => // get the val of a var
    isEmptyEnv(env) ? makeFailure(`var not found: ${v}`) :  // if empty no vars
    env.var === v ? makeOk(env.val) :   // if var = v return the val
    applyEnv(env.nextEnv, v);   // keep searching

