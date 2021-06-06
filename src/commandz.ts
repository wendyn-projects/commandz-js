type some = string|number|boolean|object;

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

export abstract class OptionBase<T> {

    protected unparsed: string[]|null = null;
    public name: string[];
    public isValid: boolean = false;
    public result: T|null = null;

    public constructor(name: string[]) {
        this.name = name;
    }

    public abstract getTokensUsed(): number;

    protected abstract validation(input: string[]): boolean;

    public validate(input: string[]): void {
        this.isValid = this.validation(input);
    }

    public abstract parse(): void;
}

export abstract class Option<T extends some> extends OptionBase<T> {

    public result: T|null = null;

    public constructor(name: string) {
        super([name]);
    }

    public getTokensUsed(): number {
        return 1;
    }

    public validate(input: string[]): void {
        this.unparsed = input;
        super.validate(input);
    }

    protected abstract parser(input: string[]) : T;

    //Is called only if `this.isValid` is true
    public parse(): void {
        if(this.isValid)
            this.result = this.parser(<string[]>this.unparsed);
    }
}

export class NumberOption extends Option<number> {

    protected validation(input: string[]): boolean {
        let output = Number(input[0]);
        if(isNaN(output)) {
            return false
        } else {
            this.result = output;
            return true;
        }
    }

    //Is called only if `this.isValid` is true
    protected parser(): number {
        return <number>this.result;
    }
}

export class StringOption extends Option<string> {

    protected validation(input: string[]): boolean {
        return input.length !== 0;
    }

    //Is called only if `this.isValid` is true
    protected parser(): string {
        return (<string[]>this.unparsed)[0];
    }
}

export class ActionResult extends Array<ActionResult|any> {
    [key: string]: ActionResult|any;
}

export abstract class ValueAction<T = any> extends OptionBase<T> {

    private tokensUsed: number;
    public usesName: boolean;
    public usedName: string|null|undefined = null;
    public options: OptionBase<any>[];
    public unparsed: ActionResult|null = null;
    public value: any;

    public constructor(name: string[], options: OptionBase<any>[], usesName: boolean = true) {
        super(name);
        this.value = {};
        this.options = options;
        this.usesName = usesName;
        this.tokensUsed = options.reduce(
            (accumulator: number, option: OptionBase<any>) => accumulator + option.getTokensUsed(), usesName? 1: 0);
    }

    public getTokensUsed(): number {
        return this.tokensUsed;
    }

    //Is called from `this.validate` where `this.unparsed` is set
    protected nameCheck(): boolean {
        return (this.usedName = this.name.find((name: string) => name === (<string[]>this.unparsed)[0]))? true: false;
    }

    protected validation(input: string[]): boolean {

        let isValidTmp = true;
        let tokenId = 0;

        for(let i = 0; i < this.options.length && isValidTmp; i++) {

            this.options[i].validate(input.slice(tokenId));

            let tokensUsed = this.options[i].getTokensUsed();
            tokenId += tokensUsed;
            isValidTmp &&= tokenId >= input.length && this.options[i].isValid;

        }

        return isValidTmp && tokenId <= input.length;
    }

    public validate(input: string[]): void {
        this.unparsed = input;
        this.isValid = 
            (!this.usesName || this.nameCheck()) && 
            this.validation(this.usesName? Array.from(input).slice(1): input);
    }

    //Is called only if `this.isValid` is true
    public parse() {

        for(let i = 0; i < this.options.length; i++) {
            let option = this.options[i];
            option.parse();
            this.value[<string>this.usedName] = option instanceof ValueAction? 
                option.value:
                option.result;
        }
    }

    protected abstract execution(): T;

    public execute(input?: string[]): void {
        if(!this.isValid && input) {
            this.validate(input);
            this.parse();
        }
        if(this.isValid)
            this.result = this.execution();
    }
}

export enum SelectionMode {
    FIRST = 0,
    LAST,
    BEST_MATCH_FIRST,
    BEST_MATCH_LAST,
}

export class ActionSelector<T = any> extends ValueAction<T> {

    public options: ValueAction<T>[];
    public usedAction: ValueAction<T>|null = null;
    public select: SelectionMode;

    public constructor(name: string[], options: ValueAction<T>[], usesName: boolean = true, select: SelectionMode = SelectionMode.FIRST) {
        super(name, options, usesName);
        this.select = select;
    }

    protected validation(input: string[]): boolean {

        let action;
        let prevTokenCount = -1;
        let tokenCount;

        switch(this.select) {
        case SelectionMode.LAST:
            for(let i = 0; i < this.options.length; i++) {
                action = this.options[i];
                action.validate(input);
                if(action.isValid)
                    this.usedAction = action;
            }
            break;
        case SelectionMode.BEST_MATCH_FIRST:
            for(let i = 0; i < this.options.length; i++) {
                action = this.options[i];
                action.validate(input);
                if(action.isValid && (tokenCount = action.getTokensUsed()) > prevTokenCount) {
                    this.usedAction = action;
                    prevTokenCount = tokenCount;
                }
            }
            break;
        case SelectionMode.BEST_MATCH_FIRST:
            for(let i = 0; i < this.options.length; i++) {
                action = this.options[i];
                action.validate(input);
                if(action.isValid && (tokenCount = action.getTokensUsed()) >= prevTokenCount) {
                    this.usedAction = action;
                    prevTokenCount = tokenCount;
                }
            }
            break;
        default:
            for(let i = 0; i < this.options.length; i++) {
                action = this.options[i];
                action.validate(input);
                if(action.isValid) {
                    this.usedAction = action;
                    break;
                }
            }
            break;
        }

        return this.usedAction? true: false;
    }

    //Is called only if `this.isValid` is true
    protected parser(input?: ActionResult) : ActionResult {
        (<ValueAction<T>>this.usedAction).parse();
        return (<ValueAction<T>>this.usedAction).value;
    }

    public parse() {
        if(this.isValid)
            this.value = this.parser();
    }

    //Is called only if `this.isValid` is true
    protected execution(): T {
        return <T>(<ValueAction<T>>this.usedAction).result;
    }

    public execute(input?: string[]): void {

        if(!this.isValid && input) {
            this.validate(input);
            this.parse();
        }
        if(this.isValid) {
            //`this.isValid` can be true only if the used action was chosen
            (<ValueAction<T>>this.usedAction).execute();
            this.result = this.execution();
        }
    }
}