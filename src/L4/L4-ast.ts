// ===========================================================
// AST type models
import * as E from "fp-ts/Either";
import { map, zipWith } from "fp-ts/ReadonlyArray";
import { pipe } from "fp-ts/function";
import { Sexp, Token } from "s-expression";
import { allT, first, second, rest, isEmpty } from "../shared/list";
import { isArray, isString, isNumericString, isIdentifier } from "../shared/type-predicates";
import { parse as p, isSexpString, isToken } from "../shared/parser";
import { isSymbolSExp, isEmptySExp, isCompoundSExp } from './L4-value';
import { makeEmptySExp, makeSymbolSExp, SExpValue, makeCompoundSExp, valueToString } from './L4-value'

/*
;; =============================================================================
;; Scheme Parser
;;
;; L2 extends L1 with support for IfExp and ProcExp
;; L3 extends L2 with support for:
;; - Pair and List datatypes
;; - Compound literal expressions denoted with quote
;; - Primitives: cons, car, cdr, list?
;; - The empty-list literal expression
;; - The Let abbreviation is also supported.
;; L4 extends L3 with:
;; - letrec
;; - set!

;; <program> ::= (L4 <exp>+) // Program(exps:List(exp))
;; <exp4> ::= <define> | <cexp>               / DefExp | CExp
;; <define> ::= ( define <var> <cexp> )       / DefExp(var:VarDecl, val:CExp)
;; <var> ::= <identifier>                     / VarRef(var:string)
;; <cexp> ::= <number>                        / NumExp(val:number)
;;         |  <boolean>                       / BoolExp(val:boolean)
;;         |  <string>                        / StrExp(val:string)
;;         |  ( lambda ( <var>* ) <cexp>+ )   / ProcExp(args:VarDecl[], body:CExp[]))
;;         |  ( if <cexp> <cexp> <cexp> )     / IfExp(test: CExp, then: CExp, alt: CExp)
;;         |  ( let ( <binding>* ) <cexp>+ )  / LetExp(bindings:Binding[], body:CExp[]))
;;         |  ( quote <sexp> )                / LitExp(val:SExp)
;;         |  ( <cexp> <cexp>* )              / AppExp(operator:CExp, operands:CExp[]))
;;         |  ( letrec ( binding*) <cexp>+ )  / LetrecExp(bindings:Bindings[], body: CExp) #### L4
;;         |  ( set! <var> <cexp>)            / SetExp(var: varRef, val: CExp)             #### L4
;; <binding>  ::= ( <var> <cexp> )            / Binding(var:VarDecl, val:Cexp)
;; <prim-op>  ::= + | - | * | / | < | > | = | not |  eq? | string=?
;;                  | cons | car | cdr | list | pair? | list? | number?
;;                  | boolean? | symbol? | string?      ##### L3
;; <num-exp>  ::= a number token
;; <bool-exp> ::= #t | #f
;; <str-exp>  ::= "tokens*"
;; <var-ref>  ::= an identifier token
;; <var-decl> ::= an identifier token
;; <sexp>     ::= symbol | number | bool | string | ( <sexp>* )              ##### L3
*/

// A value returned by parse
export type Parsed = Exp | Program;

export type Exp = DefineExp | CExp;
export type AtomicExp = NumExp | BoolExp | StrExp | PrimOp | VarRef;
export type CompoundExp = AppExp | IfExp | ProcExp | LetExp | LitExp | LetrecExp | SetExp;
export type CExp =  AtomicExp | CompoundExp;

export interface Program {tag: "Program"; exps: readonly Exp[]; }
export interface DefineExp {tag: "DefineExp"; var: VarDecl; val: CExp; }
export interface NumExp {tag: "NumExp"; val: number; }
export interface BoolExp {tag: "BoolExp"; val: boolean; }
export interface StrExp {tag: "StrExp"; val: string; }
export interface PrimOp {tag: "PrimOp"; op: PrimOpKeyword; }
export interface VarRef {tag: "VarRef"; var: string; }
export interface VarDecl {tag: "VarDecl"; var: string; }
export interface AppExp {tag: "AppExp"; rator: CExp; rands: readonly CExp[]; }
// L2
export interface IfExp {tag: "IfExp"; test: CExp; then: CExp; alt: CExp; }
export interface ProcExp {tag: "ProcExp"; args: readonly VarDecl[], body: readonly CExp[]; }
export interface Binding {tag: "Binding"; var: VarDecl; val: CExp; }
export interface LetExp {tag: "LetExp"; bindings: readonly Binding[]; body: readonly CExp[]; }
// L3
export interface LitExp {tag: "LitExp"; val: SExpValue; }
// L4
export interface LetrecExp {tag: "LetrecExp"; bindings: readonly Binding[]; body: readonly CExp[]; }
export interface SetExp {tag: "SetExp", var: VarRef; val: CExp; }

// To help parser - define a type for reserved key words.
export type SpecialFormKeyword = "lambda" | "let" | "letrec" | "if" | "set!" | "quote";
const isSpecialFormKeyword = (x: string): x is SpecialFormKeyword =>
    ["if", "lambda", "let", "quote", "letrec", "set!"].includes(x);

/*
    ;; <prim-op>  ::= + | - | * | / | < | > | = | not | and | or | eq? | string=?
    ;;                  | cons | car | cdr | pair? | number? | list
    ;;                  | boolean? | symbol? | string?      ##### L3
*/
export type PrimOpKeyword = "+" | "-" | "*" | "/" | ">" | "<" | "=" | "not" | "and" | "or" | "eq?" | "string=?" | 
        "cons" | "car" | "cdr" | "list" | "pair?" | "list?" | "number?" | "boolean?" | "symbol?" | "string?";
const isPrimOpKeyword = (x: string): x is PrimOpKeyword =>
    ["+", "-", "*", "/", ">", "<", "=", "not", "and", "or", 
     "eq?", "string=?", "cons", "car", "cdr", "list", "pair?",
     "list?", "number?", "boolean?", "symbol?", "string?"].includes(x);


// Type value constructors for disjoint types
export const makeProgram = (exps: readonly Exp[]): Program => ({tag: "Program", exps: exps});
export const makeDefineExp = (v: VarDecl, val: CExp): DefineExp =>
    ({tag: "DefineExp", var: v, val: val});
export const makeNumExp = (n: number): NumExp => ({tag: "NumExp", val: n});
export const makeBoolExp = (b: boolean): BoolExp => ({tag: "BoolExp", val: b});
export const makeStrExp = (s: string): StrExp => ({tag: "StrExp", val: s});
export const makePrimOp = (op: PrimOpKeyword): PrimOp => ({tag: "PrimOp", op: op});
export const makeVarRef = (v: string): VarRef => ({tag: "VarRef", var: v});
export const makeVarDecl = (v: string): VarDecl => ({tag: "VarDecl", var: v});
export const makeAppExp = (rator: CExp, rands: readonly CExp[]): AppExp =>
    ({tag: "AppExp", rator: rator, rands: rands});
// L2
export const makeIfExp = (test: CExp, then: CExp, alt: CExp): IfExp =>
    ({tag: "IfExp", test: test, then: then, alt: alt});
export const makeProcExp = (args: readonly VarDecl[], body: readonly CExp[]): ProcExp =>
    ({tag: "ProcExp", args: args, body: body});
export const makeBinding = (v: string, val: CExp): Binding =>
    ({tag: "Binding", var: makeVarDecl(v), val: val});
export const makeLetExp = (bindings: readonly Binding[], body: readonly CExp[]): LetExp =>
    ({tag: "LetExp", bindings: bindings, body: body});
// L3
export const makeLitExp = (val: SExpValue): LitExp =>
    ({tag: "LitExp", val: val});
// L4
export const makeLetrecExp = (bindings: readonly Binding[], body: readonly CExp[]): LetrecExp =>
    ({tag: "LetrecExp", bindings: bindings, body: body});
export const makeSetExp = (v: VarRef, val: CExp): SetExp =>
    ({tag: "SetExp", var: v, val: val});

// Type predicates for disjoint types
export const isProgram = (x: any): x is Program => x.tag === "Program";
export const isDefineExp = (x: any): x is DefineExp => x.tag === "DefineExp";

export const isNumExp = (x: any): x is NumExp => x.tag === "NumExp";
export const isBoolExp = (x: any): x is BoolExp => x.tag === "BoolExp";
export const isStrExp = (x: any): x is StrExp => x.tag === "StrExp";
export const isPrimOp = (x: any): x is PrimOp => x.tag === "PrimOp";
export const isVarRef = (x: any): x is VarRef => x.tag === "VarRef";
export const isVarDecl = (x: any): x is VarDecl => x.tag === "VarDecl";
export const isAppExp = (x: any): x is AppExp => x.tag === "AppExp";
// L2
export const isIfExp = (x: any): x is IfExp => x.tag === "IfExp";
export const isProcExp = (x: any): x is ProcExp => x.tag === "ProcExp";
export const isBinding = (x: any): x is Binding => x.tag === "Binding";
export const isLetExp = (x: any): x is LetExp => x.tag === "LetExp";
// L3
export const isLitExp = (x: any): x is LitExp => x.tag === "LitExp";
// L4
export const isLetrecExp = (x: any): x is LetrecExp => x.tag === "LetrecExp";
export const isSetExp = (x: any): x is SetExp => x.tag === "SetExp";

// Type predicates for type unions
export const isExp = (x: any): x is Exp => isDefineExp(x) || isCExp(x);
export const isAtomicExp = (x: any): x is AtomicExp =>
    isNumExp(x) || isBoolExp(x) || isStrExp(x) ||
    isPrimOp(x) || isVarRef(x);
export const isCompoundExp = (x: any): x is CompoundExp =>
    isAppExp(x) || isIfExp(x) || isProcExp(x) || isLitExp(x) || isLetExp(x) ||
    isLetrecExp(x) || isSetExp(x);
export const isCExp = (x: any): x is CExp =>
    isAtomicExp(x) || isCompoundExp(x);


// ========================================================
// Parsing

export const parseL4 = (x: string): E.Either<string, Program> =>
    pipe(
        x,
        p,
        E.chain(parseL4Program)
    );

export const parseL4Program = (sexp: Sexp): E.Either<string, Program> =>
    sexp === "" || isEmpty(sexp) ? E.left("Unexpected empty program") :
    isToken(sexp) ? E.left("Program cannot be a single token") :
    isArray(sexp) ? parseL4GoodProgram(first(sexp), rest(sexp)) :
    sexp;

const parseL4GoodProgram = (keyword: Sexp, body: readonly Sexp[]): E.Either<string, Program> =>
    keyword === "L4" && !isEmpty(body) ? pipe(body, E.traverseArray(parseL4Exp), E.map(makeProgram)) :
    E.left("Program must be of the form (L4 <exp>+)");

export const parseL4Exp = (sexp: Sexp): E.Either<string,Exp> =>
    isEmpty(sexp) ? E.left("Exp cannot be an empty list") :
    isArray(sexp) ? parseL4CompoundExp(first(sexp), rest(sexp)) :
    isToken(sexp) ? parseL4Atomic(sexp) :
    sexp;

export const parseL4CompoundExp = (op: Sexp, params: readonly Sexp[]): E.Either<string, Exp> => 
    op === "define" ? parseDefine(params) :
    parseL4CompoundCExp(op, params);

export const parseL4CompoundCExp = (op: Sexp, params: readonly Sexp[]): E.Either<string, CExp> =>
    isString(op) && isSpecialFormKeyword(op) ? parseL4SpecialForm(op, params) :
    parseAppExp(op, params);

export const parseL4SpecialForm = (op: SpecialFormKeyword, params: readonly Sexp[]): E.Either<string, CExp> =>
    isEmpty(params) ? E.left("Empty args for special form") :
    op === "if" ? parseIfExp(params) :
    op === "lambda" ? parseProcExp(first(params), rest(params)) :
    op === "let" ? parseLetExp(first(params), rest(params)) :
    op === "quote" ? parseLitExp(first(params)) :
    op === "letrec" ? parseLetrecExp(first(params), rest(params)) :
    op === "set!" ? parseSetExp(params) :
    op;

export const parseDefine = (params: readonly Sexp[]): E.Either<string, DefineExp> =>
    isEmpty(params) ? E.left("define missing 2 arguments") :
    isEmpty(rest(params)) ? E.left("define missing 1 arguments") :
    ! isEmpty(rest(rest(params))) ? E.left("define has too many arguments") :
    parseGoodDefine(first(params), second(params));

const parseGoodDefine = (variable: Sexp, val: Sexp): E.Either<string, DefineExp> =>
    ! isIdentifier(variable) ? E.left("First arg of define must be an identifier") :
    pipe(val, parseL4CExp, E.map(value => makeDefineExp(makeVarDecl(variable), value)));

export const parseL4Atomic = (token: Token): E.Either<string,CExp> =>
    token === "#t" ? E.of(makeBoolExp(true)) :
    token === "#f" ? E.of(makeBoolExp(false)) :
    isString(token) && isNumericString(token) ? E.of(makeNumExp(+token)) :
    isString(token) && isPrimOpKeyword(token) ? E.of(makePrimOp(token)) :
    isString(token) ? E.of(makeVarRef(token)) :
    E.of(makeStrExp(token.toString()));

export const parseL4CExp = (sexp: Sexp): E.Either<string,CExp> =>
    isEmpty(sexp) ? E.left("CExp cannot be an empty list") :
    isArray(sexp) ? parseL4CompoundCExp(first(sexp), rest(sexp)) :
    isToken(sexp) ? parseL4Atomic(sexp) :
    sexp;

const parseAppExp = (op: Sexp, params: readonly Sexp[]): E.Either<string, AppExp> =>
    pipe(
        op,
        parseL4CExp,
        E.chain(rator => pipe(
            params,
            E.traverseArray(parseL4CExp),
            E.map(rands => makeAppExp(rator, rands))
        ))
    );

const parseIfExp = (params: readonly Sexp[]): E.Either<string, IfExp> =>
    params.length !== 3 ? E.left("Expression not of the form (if <cexp> <cexp> <cexp>)") :
    pipe(params, E.traverseArray(parseL4CExp), E.map(([test, then, alt]) => makeIfExp(test, then, alt)));

const parseProcExp = (vars: Sexp, body: readonly Sexp[]): E.Either<string,ProcExp> =>
    isArray(vars) && allT(isString, vars) ? pipe(
        body,
        E.traverseArray(parseL4CExp),
        E.map(cexps => makeProcExp(pipe(vars, map(makeVarDecl)), cexps))
    ) :
    E.left(`Invalid vars for ProcExp`);

const isGoodBindings = (bindings: Sexp): bindings is [string, Sexp][] =>
    isArray(bindings) &&
    allT(isArray, bindings) &&
    allT(isIdentifier, map(first)(bindings));

const parseBindings = (bindings: Sexp): E.Either<string, readonly Binding[]> => {
    if (!isGoodBindings(bindings)) {
        return E.left(`Invalid bindings: ${bindings}`);
    }
    const vars = pipe(bindings, map(b => b[0]));
    const valsResult = pipe(bindings, E.traverseArray(b => parseL4CExp(second(b))));
    return pipe(
        valsResult,
        E.map(vals => zipWith(vars, vals, makeBinding))
    );
}

type LetConstructor<T> = (bindings: readonly Binding[], body: readonly CExp[]) => T;

const parseLetForm = <T>(ctor: LetConstructor<T>, bindings: Sexp, body: readonly Sexp[]): E.Either<string, T> =>
    pipe(
        bindings,
        parseBindings,
        E.chain(bindings => pipe(
            body,
            E.traverseArray(parseL4CExp),
            E.map(body => ctor(bindings, body))
        ))
    );

const parseLetExp = (bindings: Sexp, body: readonly Sexp[]): E.Either<string, LetExp> =>
    parseLetForm(makeLetExp, bindings, body);

const parseLetrecExp = (bindings: Sexp, body: readonly Sexp[]): E.Either<string, LetrecExp> =>
    parseLetForm(makeLetrecExp, bindings, body);


const parseSetExp = (params: readonly Sexp[]): E.Either<string, SetExp> =>
    isEmpty(params) ? E.left("set! missing 2 arguments") :
    isEmpty(rest(params)) ? E.left("set! missing 1 argument") :
    ! isEmpty(rest(rest(params))) ? E.left("set! has too many arguments") :
    parseGoodSetExp(first(params), second(params));

const parseGoodSetExp = (variable: Sexp, val: Sexp): E.Either<string, SetExp> =>
    ! isIdentifier(variable) ? E.left("First arg of set! must be an identifier") :
    pipe(val, parseL4CExp, E.map(val => makeSetExp(makeVarRef(variable), val)));

// LitExp has the shape (quote <sexp>)
export const parseLitExp = (param: Sexp): E.Either<string, LitExp> =>
    pipe(param, parseSExp, E.map(makeLitExp));

export const isDottedPair = (sexps: readonly Sexp[]): boolean =>
    sexps.length === 3 && 
    sexps[1] === "."

export const makeDottedPair = (sexps : readonly Sexp[]): E.Either<string, SExpValue> =>
    pipe(
        sexps[0],
        parseSExp,
        E.chain(val1 => pipe(
            sexps[2],
            parseSExp,
            E.map(val2 => makeCompoundSExp(val1, val2))
        ))
    );

// x is the output of p (sexp parser)
export const parseSExp = (sexp: Sexp): E.Either<string, SExpValue> =>
    sexp === "#t" ? E.of(true) :
    sexp === "#f" ? E.of(false) :
    isString(sexp) && isNumericString(sexp) ? E.of(+sexp) :
    isSexpString(sexp) ? E.of(sexp.toString()) :
    isString(sexp) ? E.of(makeSymbolSExp(sexp)) :
    sexp.length === 0 ? E.of(makeEmptySExp()) :
    isDottedPair(sexp) ? makeDottedPair(sexp) :
    isArray(sexp) ? (
        // fail on (x . y z)
        sexp[0] === '.' ? E.left("Bad dotted sexp: " + sexp) : 
        pipe(
            parseSExp(first(sexp)),
            E.chain(val1 => pipe(
                parseSExp(rest(sexp)),
                E.map(val2 => makeCompoundSExp(val1, val2))
            ))
        )) :
    sexp;

// ==========================================================================
// Unparse: Map an AST to a concrete syntax string.

// Add a quote for symbols, empty and compound sexp - strings and numbers are not quoted.
const unparseLitExp = (le: LitExp): string =>
    isEmptySExp(le.val) ? `'()` :
    isSymbolSExp(le.val) ? `'${valueToString(le.val)}` :
    isCompoundSExp(le.val) ? `'${valueToString(le.val)}` :
    `${le.val}`;

const unparseLExps = (les: readonly Exp[]): string =>
    pipe(les, map(unparse), strs => strs.join(" "));

const unparseProcExp = (pe: ProcExp): string => 
    `(lambda (${pipe(pe.args, map((p: VarDecl) => p.var), args => args.join(" "))}) ${unparseLExps(pe.body)})`

const unparseBindings = (bdgs: readonly Binding[]): string =>
    pipe(bdgs, map(b => `(${b.var.var} ${unparse(b.val)})`), strs => strs.join(" "));

const unparseLetExp = (le: LetExp) : string => 
    `(let (${unparseBindings(le.bindings)}) ${unparseLExps(le.body)})`

const unparseLetrecExp = (le: LetrecExp): string => 
    `(letrec (${unparseBindings(le.bindings)}) ${unparseLExps(le.body)})`

const unparseSetExp = (se: SetExp): string =>
    `(set! ${se.var.var} ${unparse(se.val)})`;

export const unparse = (exp: Parsed): string =>
    isBoolExp(exp) ? valueToString(exp.val) :
    isNumExp(exp) ? valueToString(exp.val) :
    isStrExp(exp) ? valueToString(exp.val) :
    isLitExp(exp) ? unparseLitExp(exp) :
    isVarRef(exp) ? exp.var :
    isProcExp(exp) ? unparseProcExp(exp) :
    isIfExp(exp) ? `(if ${unparse(exp.test)} ${unparse(exp.then)} ${unparse(exp.alt)})` :
    isAppExp(exp) ? `(${unparse(exp.rator)} ${unparseLExps(exp.rands)})` :
    isPrimOp(exp) ? exp.op :
    isLetExp(exp) ? unparseLetExp(exp) :
    isLetrecExp(exp) ? unparseLetrecExp(exp) :
    isSetExp(exp) ? unparseSetExp(exp) :
    isDefineExp(exp) ? `(define ${exp.var.var} ${unparse(exp.val)})` :
    isProgram(exp) ? `(L4 ${unparseLExps(exp.exps)})` :
    exp;
