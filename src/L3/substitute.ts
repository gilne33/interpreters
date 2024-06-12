import { filter, indexOf, map, includes, zip, KeyValuePair } from "ramda";
import { CExp, ProcExp, VarDecl, VarRef } from "./L3-ast";
import { isAppExp, isBoolExp, isIfExp, isLitExp, isNumExp, isPrimOp, isProcExp, isStrExp, isVarRef } from "./L3-ast";
import { makeAppExp, makeIfExp, makeProcExp, makeVarDecl, makeVarRef } from "./L3-ast";
import { first } from '../shared/list';

// For applicative eval - the type of exps should be ValueExp[] | VarRef[];
// where ValueExp is an expression which directly encodes a value:
// export type ValueExp = LitExp | NumExp | BoolExp | StrExp | PrimOp;
// In order to support normal eval as well - we generalize the types to CExp.
// @Pre: vars and exps have the same length
export const substitute = (body: CExp[], vars: string[], exps: CExp[]): CExp[] => { //get a body, list of vars and list of vals to apply in the body
    const subVarRef = (e: VarRef): CExp => { //check if e is in the vars that need to change
        const pos = indexOf(e.var, vars);
        return ((pos > -1) ? exps[pos] : e);
    };
    
    const subProcExp = (e: ProcExp): ProcExp => { //apply to lambda. 
        const argNames = map((x) => x.var, e.args); //get the args name from the function
        const subst = zip(vars, exps);  //ge t2 list and return a list of pairs- each pair is var name and value
        const freeSubst = filter((ve) => !includes(ve[0], argNames), subst);    //filter each pair that the val name is in the vals name of the function. get only the free vars
        return makeProcExp( //make new proc with sub the body of the vals that are free
            e.args,
            substitute(
                e.body,
                map((x: KeyValuePair<string, CExp>) => x[0], freeSubst),
                map((x: KeyValuePair<string, CExp>) => x[1], freeSubst)
            )
        );
    };
    
    const sub = (e: CExp): CExp => isNumExp(e) ? e :
        isBoolExp(e) ? e :
        isPrimOp(e) ? e :
        isLitExp(e) ? e :
        isStrExp(e) ? e :
        isVarRef(e) ? subVarRef(e) : 
        isIfExp(e) ? makeIfExp(sub(e.test), sub(e.then), sub(e.alt)) : //recursivly on each part and make new if exp
        isProcExp(e) ? subProcExp(e) :
        isAppExp(e) ? makeAppExp(sub(e.rator), map(sub, e.rands)) :
        e;
    
    return map(sub, body); // apply sub to the whole body
};
/*
    Purpose: create a generator of new symbols of the form v__n
    with n incremented at each call.
*/
export const makeVarGen = (): (v: string) => string => {
    let count: number = 0;
    return (v: string) => {
        count++;
        return `${v}__${count}`;
    };
};
/*
Purpose: Consistently rename bound variables in 'exps' to fresh names.
         Start numbering at 1 for all new var names.
*/
export const renameExps = (exps: CExp[]): CExp[] => {
    const varGen = makeVarGen();
    const replace = (e: CExp): CExp =>
        isIfExp(e) ? makeIfExp(replace(e.test), replace(e.then), replace(e.alt)) :
        isAppExp(e) ? makeAppExp(replace(e.rator), map(replace, e.rands)) :
        isProcExp(e) ? replaceProc(e) :
        e;
    
    // Rename the params and substitute old params with renamed ones.
    //  First recursively rename all ProcExps inside the body.
    const replaceProc = (e: ProcExp): ProcExp => {
        const oldArgs = map((arg: VarDecl): string => arg.var, e.args);
        const newArgs = map(varGen, oldArgs);
        const newBody = map(replace, e.body);
        return makeProcExp(map(makeVarDecl, newArgs), substitute(newBody, oldArgs, map(makeVarRef, newArgs)));
    };
    
    return map(replace, exps);
};
