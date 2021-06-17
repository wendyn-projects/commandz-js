/**
 * Tokenizes a string into string[].
 * @param input is the string to be tokenized.
 * @returns tokenized input.
 * @example tokenize('aaa aaa "aaa aaa" aaa"aaa') => ['aaa', 'aaa', 'aaa aaa', 'aaa"aaa']
 */
export function tokenize(input: string) : string[] {
    //space/quote separating RegEx tokenizer
    const TOKENIZER = /(?:")([^"]*)(?:")|(?:')([^']*)(?:')|(?:`)([^`]*)(?:`)|([^\s]+)/gm;
    let tokenVals: string[] = [];
    let tokenVal: string;
    let matchIterator = input.matchAll(TOKENIZER);
    for(let match of matchIterator) {
        tokenVal = '';
        for(let i = 1; i < match.length; i++) {
            if(match[i] !== undefined) {
                tokenVal = match[i];
                break;
            }
        }
        tokenVals.push(tokenVal);
    }
    return tokenVals;
}

class OptionResults extends Array<OptionResults|any> {
    [key: string]: OptionResults|any;
}

export abstract class Action<T = any> {

    private _hasName: boolean;
    private _names: ReadonlyArray<string>|undefined;
    private _isCalledByName: boolean;
    private _input: ReadonlyArray<string>|undefined;
    private _tokensUsed: number|undefined;
    protected _options: Action<any>[];
    /**
     * Contains the results of individual options.
     */
    protected _optionResults: OptionResults = [];
    protected _isValid: boolean = false;
    protected _result: T|undefined;

    public constructor(options: Action<any>[], names?: string[], isCalledByName: boolean = true) {
        if(names !== undefined && names.length > 0) {
            this._hasName = true;
            this._names = names;
            this._isCalledByName = isCalledByName;
        } else {
            this._hasName = false;
            this._isCalledByName = false;
        }
        this._options = options;
    }
    
    public get hasName(): boolean {
        return this._hasName;
    }

    public get names(): ReadonlyArray<string>|undefined {
        return this._names;
    }

    public get isCalledByName(): boolean {
        return this._isCalledByName;
    }

    public get input(): ReadonlyArray<string>|undefined {
        return this._input;
    }

    public get isValid(): boolean|undefined {
        return this._isValid;
    }

    /**
     * @returns number of used input tokens if `this.isValid` is true, otherwise `undefined`.
     */
    public get tokensUsed(): number|undefined {
        return this._isValid? this._tokensUsed: undefined;
    }

    /**
     * @returns result of `this.run`
     */
    public get result(): T|undefined {
        return this._result;
    }

    protected checkName(usedName: string): boolean {
        return (<string[]>this._names).some((name: string) => name === usedName);
    }

    protected validateOptions(): boolean {
        let input = <string[]>this.input;
        let tokenId = 0;

        for(let i = 0; i < this._options.length && tokenId <= input.length; i++) {

            this._options[i].validate(input.slice(tokenId));

            if(this._options[i]._isValid)
                tokenId += <number>this._options[i].tokensUsed;
            else 
                return false;
        }

        this._tokensUsed = this.hasName? tokenId + 1: tokenId;

        return true;
    }

    /**
     * Custom Input Validation (the input is stored in `this.input`)
     * @returns validity of the input.
     */
    protected abstract validation(): boolean;

    /**
     * Validates the input.
     * @param input is the input to be validated.
     * @returns validity of the input.
     */
    public validate(input: ReadonlyArray<string>): boolean {

        this._tokensUsed = undefined;
        this._result = undefined;

        if(this.isCalledByName) {
            if(this.checkName(input[0]))
                this._input = Array.from(input).slice(1);
            else 
                return false;
        } else {
            this._input = input;
        }
        
        return this.validateOptions()? this._isValid = this.validation(): false;
    }

    /**
     * Is called by `this.run` and only if `this.isValid` is true.
     * Collects all results from `this.options`.
     */
    protected runOptions(): OptionResults {

        let optionResults: OptionResults = [];

        for(const option of this._options) {

            option.run();
            if(option.hasName)
                optionResults[(<string[]>option.names)[0]] = option._result;

            optionResults.push(option._result);
        }
        return optionResults;
    }

    /**
     * Is called by `this.run` and only if `this.isValid` is true.
     * @returns result of this option.
     */
    protected abstract runner(): T;

    /**
     * Generates the result of this option.
     * @param input is used as input for this option, but if the option was validated before the input isn't requiered.
     * @returns result of this option.
     */
    public run(input?: string[]): T|undefined {

        if(input) {
            this.validate(input);
        }

        if(this._isValid) {
            this._optionResults = this.runOptions();
            this._result = this.runner();
        } else {
            this._optionResults = [];
        }

        return this._result;
    }
}

export abstract class SimpleOption<T extends any> extends Action<T> {

    public constructor(names?: string[], isCalledByName: boolean = false) {
        super([], names, isCalledByName);
    }

    public get tokensUsed(): number|undefined {
        return this._isValid? this.isCalledByName? 2: 1: undefined;
    }

    protected abstract validation(): boolean;

    protected abstract runner(): T;
}

export class NumberParser extends SimpleOption<number> {

    protected validation(): boolean {
        let output = Number((<string[]>this.input)[0]);
        if(isNaN(output)) {
            return false;
        } else {
            this._result = output;
            return true;
        }
    }

    protected runner(): number {
        return <number>this._result;
    }
}

export class StringParser extends SimpleOption<string> {

    protected validation(): boolean {
        return (<string[]>this.input).length !== 0;
    }

    protected runner(): string {
        return (<string[]>this.input)[0];
    }
}

export enum SelectionMode {
    FIRST = 0,
    LAST,
    BEST_MATCH_FIRST,
    BEST_MATCH_LAST,
}

export class ActionSelector<T = any> extends Action<T> {

    protected _usedAction: Action<T>|undefined;
    protected _mode: SelectionMode;

    public constructor(options: Action<T>[], names: string[], isCalledByName: boolean = true, select: SelectionMode = SelectionMode.FIRST) {
        super(options, names, isCalledByName);
        this._mode = select;
    }

    public get usedAction(): Action<T>|undefined {
        return this._usedAction;
    }

    public get mode(): SelectionMode {
        return this._mode;
    }

    public set mode(value: SelectionMode) {
        this._mode = value;
    }

    protected validateOptions(): boolean {

        let action;
        let input = <string[]>this.input;
        let prevTokenCount = -1;
        let tokenCount;

        switch(this._mode) {
        case SelectionMode.LAST:
            for(let i = 0; i < this._options.length; i++) {
                action = this._options[i];
                action.validate(input);
                if(action.isValid)
                    this._usedAction = action;
            }
            break;
        case SelectionMode.BEST_MATCH_FIRST:
            for(let i = 0; i < this._options.length; i++) {
                action = this._options[i];
                action.validate(input);
                if(action.isValid && (tokenCount = <number>action.tokensUsed) > prevTokenCount) {
                    this._usedAction = action;
                    prevTokenCount = tokenCount;
                }
            }
            break;
        case SelectionMode.BEST_MATCH_FIRST:
            for(let i = 0; i < this._options.length; i++) {
                action = this._options[i];
                action.validate(input);
                if(action.isValid && (tokenCount = <number>action.tokensUsed) >= prevTokenCount) {
                    this._usedAction = action;
                    prevTokenCount = tokenCount;
                }
            }
            break;
        default:
            for(let i = 0; i < this._options.length; i++) {
                action = this._options[i];
                action.validate(input);
                if(action.isValid) {
                    this._usedAction = action;
                    break;
                }
            }
            break;
        }

        return this._usedAction? true: false;
    }

    protected validation(): boolean {
        return true;
    }

    public validate(input: ReadonlyArray<string>): boolean {
        this._usedAction = undefined;
        return super.validate(input);
    }

    protected runner(): T {
        return <T>(<Action<T>>this._usedAction).result;
    }

    public run(input?: string[]): T|undefined {

        if(input) {
            this.validate(input);
        }

        if(this._isValid) {
            this._optionResults = this.runOptions();
            this._result = this.runner();
        } else {
            this._optionResults = [];
        }

        return this._result;
    }
}