const assert = require('assert');
const { parse, find, findLast, findAll } = require('./helpers/lib');
const { lazyValues } = require('./helpers');
const values = lazyValues({
    ast: () => parse(`
        .foo { color: red; background: green; }
        .bar, .qux.foo { font-weight: bold; color: blue; }
    `),
    firstFoo: () => values.ast
        .children.first    // Rule
        .prelude           // SelectorList
        .children.first    // Selector
        .children.first,   // ClassSelector
    lastFoo: () => values.ast
        .children.last     // Rule
        .prelude           // SelectorList
        .children.last     // Selector
        .children.last     // ClassSelector
});

describe('Search', () => {
    describe('find', () => {
        it('base', () => {
            const actual = find(values.ast, node =>
                node.type === 'ClassSelector' && node.name === 'foo'
            );

            assert.equal(actual, values.firstFoo);
        });

        it('using refs', () => {
            const actual = find(values.ast, (node, item, list) =>
                node.type === 'ClassSelector' && node.name === 'foo' && list.head !== item
            );

            assert.equal(actual, values.lastFoo);
        });

        it('using context', () => {
            const actual = find(values.ast, function(node) {
                return (
                    node.type === 'ClassSelector' &&
                    node.name === 'foo' &&
                    this.selector.children.head !== this.selector.children.tail
                );
            });

            assert.equal(actual, values.lastFoo);
        });
    });

    describe('findLast', () => {
        it('findLast', () => {
            const actual = findLast(values.ast, node =>
                node.type === 'ClassSelector' && node.name === 'foo'
            );

            assert.equal(actual, values.lastFoo);
        });

        it('using refs', () => {
            const actual = findLast(values.ast, (node, item, list) =>
                node.type === 'ClassSelector' && node.name === 'foo' && list.head === item
            );

            assert.equal(actual, values.firstFoo);
        });

        it('using context', () => {
            const actual = findLast(values.ast, function(node) {
                return (
                    node.type === 'ClassSelector' &&
                    node.name === 'foo' &&
                    this.selector.children.head === this.selector.children.tail
                );
            });

            assert.equal(actual, values.firstFoo);
        });
    });

    it('findAll', () => {
        const actual = findAll(values.ast, node =>
            node.type === 'ClassSelector' && node.name === 'foo'
        );

        assert.equal(actual.length, 2);
        assert.equal(actual[0], values.firstFoo);
        assert.equal(actual[1], values.lastFoo);
    });
});
