import { any as some } from "ramda";
import { map, reduce, union, includes } from "ramda";
import { VarRef, Exp, Program } from "./L3-ast";
import { isAppExp, isAtomicExp, isBoolExp, isDefineExp, isIfExp, isLetExp, isLitExp, isNumExp,
         isPrimOp, isProcExp, isProgram, isStrExp, isVarRef } from './L3-ast';

const zero: number = 0
const varRefUnion = (x: VarRef[], y: VarRef[]) => union(x, y);

// TODO: No error handling
export const height = (exp: Program | Exp): number =>
    isAtomicExp(exp) ? 1 :  // atomic doesnt have children
    isLitExp(exp) ? 1 : // leteral doesnt have children
    isDefineExp(exp) ? 1 + height(exp.val) :    // for define we check the value recursively
    isIfExp(exp) ? 1 + Math.max(height(exp.test), height(exp.then), height(exp.alt)) :  //check recursively the 3 parts
    isProcExp(exp) ? 1 + reduce(Math.max, zero,
                                map((bodyExp) => height(bodyExp), exp.body)) : // map the bod yrecursively and take the maximum
    isLetExp(exp) ? 1 + Math.max(
                            reduce(Math.max, zero,
                                   map((binding) => height(binding.val), exp.bindings)), // calculate the binding
                            reduce(Math.max, zero,
                                   map((bodyExp) => height(bodyExp), exp.body))) :      // calculate the body
    isAppExp(exp) ? Math.max(height(exp.rator), //calculate the rator and the randing
                             reduce(Math.max, zero,
                                    map((rand) => height(rand), exp.rands))) :
    isProgram(exp) ? 1 + reduce(Math.max, zero,
                                map((e) => height(e), exp.exps)) :  //calculate all the exp of the program
    exp;

export const occursFree = (v: string, e: Program | Exp): boolean =>
    isBoolExp(e) ? false :  // nor occuring at all
    isNumExp(e) ? false :
    isStrExp(e) ? false :
    isLitExp(e) ? false :
    isVarRef(e) ? (v === e.var) :   //check if the name of v is the same
    isIfExp(e) ? occursFree(v, e.test) || occursFree(v, e.then) || occursFree(v, e.alt) :
    isProcExp(e) ? ! includes(v, map((p) => p.var, e.args)) && // check if the arguments name of the proc include v
                   some((b) => occursFree(v, b), e.body) :  // check if v occur in the body
    isPrimOp(e) ? false :
    isAppExp(e) ? occursFree(v, e.rator) ||     // check the rator and the rands
                  some((rand) => occursFree(v, rand), e.rands) :
    isDefineExp(e) ? (v !== e.var.var) && occursFree(v, e.val) :    
    isLetExp(e) ? false : // TODO
    isProgram(e) ? false : // TODO
    e;

export const referencedVars = (e: Program | Exp): VarRef[] => //return the list of all the vars 
    isBoolExp(e) ? Array<VarRef>() :
    isNumExp(e) ? Array<VarRef>() :
    isStrExp(e) ? Array<VarRef>() :
    isLitExp(e) ? Array<VarRef>() :
    isPrimOp(e) ? Array<VarRef>() :
    isVarRef(e) ? [e] :
    isIfExp(e) ? reduce(varRefUnion, Array<VarRef>(),   // take all the vars in each part and make union
                        map(referencedVars, [e.test, e.then, e.alt])) :
    isAppExp(e) ? union(referencedVars(e.rator),
                        reduce(varRefUnion, Array<VarRef>(), map(referencedVars, e.rands))) :
    isProcExp(e) ? reduce(varRefUnion, Array<VarRef>(), map(referencedVars, e.body)) :
    isDefineExp(e) ? referencedVars(e.val) :
    isProgram(e) ? reduce(varRefUnion, Array<VarRef>(), map(referencedVars, e.exps)) :
    isLetExp(e) ? Array<VarRef>() : // TODO
    e;
