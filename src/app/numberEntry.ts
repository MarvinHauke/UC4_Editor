// A number field's entry: a browser reports bad text in a number input ("12e", "-", "1.5.") as '' too.
/** Nothing typed. Bad text is not empty: it is a value that is not allowed. */
export const isEmptyEntry = (value: string, badInput: boolean): boolean => value === '' && !badInput;
