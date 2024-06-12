// L3-eval.ts
import { map } from "ramda";
import { isCExp, isLetExp } from "./L3-ast";
import { BoolExp, CExp, Exp, IfExp, LitExp, NumExp,
         PrimOp, ProcExp, Program, StrExp, VarDecl } from "./L3-ast";
import { isAppExp, isBoolExp, isDefineExp, isIfExp, isLitExp, isNumExp,
             isPrimOp, isProcExp, isStrExp, isVarRef } from "./L3-ast";
import { makeBoolExp, makeLitExp, makeNumExp, makeProcExp, makeStrExp } from "./L3-ast";
import { parseL3Exp } from "./L3-ast";
import { applyEnv, makeEmptyEnv, makeEnv, Env } from "./L3-env";
import { isClosure, makeClosure, Closure, Value } from "./L3-value";
import { first, rest, isEmpty, List, isNonEmptyList } from '../shared/list';
import { isBoolean, isNumber, isString } from "../shared/type-predicates";
import { Result, makeOk, makeFailure, bind, mapResult, mapv } from "../shared/result";
import { renameExps, substitute } from "./substitute";
import { applyPrimitive } from "./evalPrimitive";
import { parse as p } from "../shared/parser";
import { Sexp } from "s-expression";
import { format } from "../shared/format";

// ========================================================
// Eval functions

const L3applicativeEval = (exp: CExp, env: Env): Result<Value> => //get cexp and return value
    isNumExp(exp) ? makeOk(exp.val) : 
    isBoolExp(exp) ? makeOk(exp.val) :
    isStrExp(exp) ? makeOk(exp.val) :
    isPrimOp(exp) ? makeOk(exp) : // like the value of +
    isVarRef(exp) ? applyEnv(env, exp.var) : //ge tthe value from env
    isLitExp(exp) ? makeOk(exp.val) : // get the value
    isIfExp(exp) ? evalIf(exp, env) :   
    isProcExp(exp) ? evalProc(exp, env) :
    isAppExp(exp) ? bind(L3applicativeEval(exp.rator, env), (rator: Value) => //first calculate the rator and get a value
                        bind(mapResult(param => L3applicativeEval(param, env), exp.rands), (rands: Value[]) =>   //then using the value of the rator calculate all th oprands and get a list of them
                            L3applyProcedure(rator, rands, env))) : // after getting a list of the rands, call apllyprocedure to put the values 
    isLetExp(exp) ? makeFailure('"let" not supported (yet)') : // let has changed to lamba, so if let get here its error
    exp;

export const isTrueValue = (x: Value): boolean =>
    ! (x === false);

const evalIf = (exp: IfExp, env: Env): Result<Value> =>
    bind(L3applicativeEval(exp.test, env), (test: Value) => //calculate the test, the calculate the then/alt according to it
        isTrueValue(test) ? L3applicativeEval(exp.then, env) : // calculate the then cexp
        L3applicativeEval(exp.alt, env));   // else, calculate alt

const evalProc = (exp: ProcExp, env: Env): Result<Closure> =>
    makeOk(makeClosure(exp.args, exp.body)); // return closure wit hargs and body

const L3applyProcedure = (proc: Value, args: Value[], env: Env): Result<Value> =>
    isPrimOp(proc) ? applyPrimitive(proc, args) : //call the primitive calculation
    isClosure(proc) ? applyClosure(proc, args, env) :
    makeFailure(`Bad procedure ${format(proc)}`);

// Applications are computed by substituting computed
// values into the body of the closure.
// To make the types fit - computed values of params must be
// turned back in Literal Expressions that eval to the computed value.
const valueToLitExp = (v: Value): NumExp | BoolExp | StrExp | LitExp | PrimOp | ProcExp =>
    isNumber(v) ? makeNumExp(v) :
    isBoolean(v) ? makeBoolExp(v) :
    isString(v) ? makeStrExp(v) :
    isPrimOp(v) ? v :
    isClosure(v) ? makeProcExp(v.params, v.body) :
    makeLitExp(v);

const applyClosure = (proc: Closure, args: Value[], env: Env): Result<Value> => {
    const vars: string[] = map((v: VarDecl) => v.var, proc.params); // take all the vars declaration
    const body = renameExps(proc.body); //rename all the vars (th eones that not free)
    const litArgs = map(valueToLitExp, args); // return the values to exp so we can substute
    return evalSequence(substitute(body, vars, litArgs), env); //sub each var with the value. then calculate the body with eval.
}

// Evaluate a sequence of expressions (in a program)
export const evalSequence = (seq: List<Exp>, env: Env): Result<Value> => // get a list of exp and env and return the last value
    isNonEmptyList<Exp>(seq) ? 
        isDefineExp(first(seq)) ? evalDefineExps(first(seq), rest(seq), env) : // if define eval define exp
        evalCExps(first(seq), rest(seq), env) : // else eval cexp
    makeFailure("Empty sequence");

const evalCExps = (first: Exp, rest: Exp[], env: Env): Result<Value> =>
    isCExp(first) && isEmpty(rest) ? L3applicativeEval(first, env) :
    isCExp(first) ? bind(L3applicativeEval(first, env), _ => 
                            evalSequence(rest, env)) :
    makeFailure("Never");

// Eval a sequence of expressions when the first exp is a Define.
// Compute the rhs of the define, extend the env with the new binding
// then compute the rest of the exps in the new env.
const evalDefineExps = (def: Exp, exps: Exp[], env: Env): Result<Value> => 
    isDefineExp(def) ? bind(L3applicativeEval(def.val, env), // calculate the value using l3apllicativeevla, then make new env with the var name, value and the current env. 
                                 (rhs: Value) =>    // after get the value bind use this code:
                                    evalSequence(exps, 
                                        makeEnv(def.var.var, rhs, env))) :
    makeFailure(`Unexpected in evalDefine: ${format(def)}`);

// Main program
export const evalL3program = (program: Program): Result<Value> => // get program and return value (in a result)
    evalSequence(program.exps, makeEmptyEnv()); // calculate the whole exp and return the ast value. start with empty env

export const evalParse = (s: string): Result<Value> =>
    bind(p(s), (sexp: Sexp) => 
        bind(parseL3Exp(sexp), (exp: Exp) =>
            evalSequence([exp], makeEmptyEnv())));
