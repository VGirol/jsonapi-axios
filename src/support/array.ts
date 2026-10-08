export const toArray = <A>(x: A | Array<A>): Array<A> => (Array.isArray(x) ? x : [x]);
