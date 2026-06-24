// Hermes (the React Native JS engine) provides these as globals, but the
// React Native tsconfig doesn't include the `dom` lib where they're typed.
declare function btoa(data: string): string;
declare function atob(data: string): string;
