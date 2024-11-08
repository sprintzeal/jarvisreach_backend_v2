# Installation
> `npm install --save @types/psl`

# Summary
This package contains type definitions for psl (https://github.com/wrangr/psl#readme).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/psl.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/psl/index.d.ts)
````ts
export as namespace psl;

export function parse(domain: string): ParsedDomain | ParseError;

export function get(domain: null | undefined): null;
export function get(domain: string): string | null;

export function isValid(domain: string): boolean;

export interface ParsedDomain {
    tld: string | null;
    sld: string | null;
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
    input: string;
    error: undefined;
}

export interface ParseError {
    input: string;
    error: {
        code:
            | "DOMAIN_TOO_SHORT"
            | "DOMAIN_TOO_LONG"
            | "LABEL_STARTS_WITH_DASH"
            | "LABEL_ENDS_WITH_DASH"
            | "LABEL_TOO_LONG"
            | "LABEL_TOO_SHORT"
            | "LABEL_INVALID_CHARS";
        message: string;
    };
}

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 09:09:39 GMT
 * Dependencies: none

# Credits
These definitions were written by [BendingBender](https://github.com/BendingBender).
