import { map } from "ramda";
import { AppExp, CExp, Exp, LetExp, Program }  from "./L3-ast";
import { isAppExp, isAtomicExp, isCExp, isDefineExp, isExp, isIfExp, isLetExp, isLitExp,
         isProcExp, isProgram }  from "./L3-ast";
import { makeAppExp, makeDefineExp, makeIfExp, makeProcExp, makeProgram } from "./L3-ast";

/*
Purpose: rewrite a single LetExp as a lambda-application form
Signature: rewriteLet(cexp)
Type: [LetExp => AppExp]
*/
const rewriteLet = (e: LetExp): AppExp => { //convert let to appExp
    const vars = map((b) => b.var, e.bindings); //take the vars
    const vals = map((b) => b.val, e.bindings); //take the vals
    return makeAppExp(     
            makeProcExp(vars, e.body), //make proc exp prom the vars and body
            vals);   // make app exp with the proc and the vals
}

/*
Purpose: rewrite all occurrences of let in an expression to lambda-applications.
Signature: rewriteAllLet(exp)
Type: [Program | Exp -> Program | Exp]
*/
export const rewriteAllLet = (exp: Program | Exp): Program | Exp => //take the whole ast and conver every occurent of let
    isExp(exp) ? rewriteAllLetExp(exp) :
    isProgram(exp) ? makeProgram(map(rewriteAllLetExp, exp.exps)) :
    exp;

const rewriteAllLetExp = (exp: Exp): Exp =>
    isCExp(exp) ? rewriteAllLetCExp(exp) :
    isDefineExp(exp) ? makeDefineExp(exp.var, rewriteAllLetCExp(exp.val)) :
    exp;

const rewriteAllLetCExp = (exp: CExp): CExp =>
    isAtomicExp(exp) ? exp :    //no replace for atomic, no let
    isLitExp(exp) ? exp :   // same
    isIfExp(exp) ? makeIfExp(rewriteAllLetCExp(exp.test),   //call recursivlelt the 3 parts and build new if exp
                             rewriteAllLetCExp(exp.then),
                             rewriteAllLetCExp(exp.alt)) :
    isAppExp(exp) ? makeAppExp(rewriteAllLetCExp(exp.rator),    //replace the rator and rans and build new app exp
                               map(rewriteAllLetCExp, exp.rands)) :
    isProcExp(exp) ? makeProcExp(exp.args, map(rewriteAllLetCExp, exp.body)) :
    isLetExp(exp) ? rewriteAllLetCExp(rewriteLet(exp)) :
    exp;
