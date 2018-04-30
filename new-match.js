const csstree = require('./lib');

const MATCH = 'match';
const MISMATCH = 'mismatch';
const NON_EMPTY = { type: 'DisallowEmpty' };
const COMMA = { type: 'Comma' };
let id = 1; // TODO: remove
let totalIterationCount = 0;

function createCondition(match, thenBranch, elseBranch) {
    // reduce node count
    if (thenBranch === MATCH && elseBranch === MISMATCH) {
        return match;
    }

    if (match === MATCH && thenBranch === MATCH && elseBranch === MATCH) {
        return match;
    }

    return {
        type: 'If',
        id: id++, // TODO: remove
        match: match,
        then: thenBranch,
        else: elseBranch
    };
}

function buildGroupMatchTree(node, atLeastOneTermMatched) {
    switch (node.combinator) {
        case ' ':
            // Juxtaposing components means that all of them must occur, in the given order.
            //
            // a b c
            // =
            // match a
            //   then match b
            //     then match c
            //       then MATCH
            //       else MISMATCH
            //     else MISMATCH
            //   else MISMATCH
            var result = MATCH;

            for (var i = node.terms.length - 1; i >= 0; i--) {
                var term = node.terms[i];

                result = createCondition(
                    buildMatchTree(term),
                    result,
                    MISMATCH
                );
            };

            return result;

        case '|':
            // A bar (|) separates two or more alternatives: exactly one of them must occur.
            //
            // a | b | c
            // =
            // match a
            //   then MATCH
            //   else match b
            //     then MATCH
            //     else match c
            //       then MATCH
            //       else MISMATCH

            var result = MISMATCH;

            for (var i = node.terms.length - 1; i >= 0; i--) {
                result = createCondition(
                    buildMatchTree(node.terms[i]),
                    MATCH,
                    result
                );
            };

            return result;

        case '&&':
            // A double ampersand (&&) separates two or more components, all of which must occur, in any order.
            //
            // a && b && c
            // =
            // match a
            //   then [b && c]
            //   else match b
            //     then [a && c]
            //     else match c
            //       then [a && b]
            //       else MISMATCH
            //
            // a && b
            // =
            // match a
            //   then match b
            //     then MATCH
            //     else MISMATCH
            //   else match b
            //     then match a
            //       then MATCH
            //       else MISMATCH
            //     else MISMATCH
            var result = MISMATCH;

            for (var i = node.terms.length - 1; i >= 0; i--) {
                var term = node.terms[i];
                var thenClause;

                if (node.terms.length > 1) {
                    thenClause = buildGroupMatchTree({
                        type: 'Group',
                        terms: node.terms.filter(function(newGroupTerm) {
                            return newGroupTerm !== term;
                        }),
                        combinator: node.combinator,
                        disallowEmpty: false
                    });
                } else {
                    thenClause = MATCH;
                }

                result = createCondition(
                    buildMatchTree(term),
                    thenClause,
                    result
                );
            };

            return result;

        case '||':
            // A double bar (||) separates two or more options: one or more of them must occur, in any order.
            //
            // a || b || c
            // =
            // match a
            //   then [b || c]
            //   else match b
            //     then [a || c]
            //     else match c
            //       then [a || b]
            //       else MISMATCH
            //
            // a || b
            // =
            // match a
            //   then match b
            //     then MATCH
            //     else MATCH
            //   else match b
            //     then match a
            //       then MATCH
            //       else MATCH
            //     else MISMATCH
            var result = atLeastOneTermMatched ? MATCH : MISMATCH;

            for (var i = node.terms.length - 1; i >= 0; i--) {
                var term = node.terms[i];
                var thenClause;

                if (node.terms.length > 1) {
                    thenClause = buildGroupMatchTree({
                        type: 'Group',
                        terms: node.terms.filter(function(newGroupTerm) {
                            return newGroupTerm !== term;
                        }),
                        combinator: node.combinator,
                        disallowEmpty: false
                    }, true);
                } else {
                    thenClause = MATCH;
                }

                result = createCondition(
                    buildMatchTree(term),
                    thenClause,
                    result
                );
            };

            return result;
    }
}

function buildMultiplierMatchTree(node) {
    var matchTerm = buildMatchTree(node.term);
    var result = MATCH;

    if (node.max === 0) {
        // an occurrence count is not limited, make a cycle
        // to collect more terms on each following matching mismatch
        result = createCondition(
            matchTerm,
            null, // will be a loop
            MISMATCH
        );

        result.then = createCondition(
            MATCH,
            MATCH,
            result // make a loop
        );

        if (node.comma) {
            result.then.else = createCondition(
                COMMA,
                result,
                MISMATCH
            );
        }
    } else {
        // create a match node chain for [min .. max] interval with optional matches
        for (var i = node.min || 1; i <= node.max; i++) {
            if (node.comma && result !== MATCH) {
                result = createCondition(
                    COMMA,
                    result,
                    MISMATCH
                );
            }

            result = createCondition(
                matchTerm,
                createCondition(
                    MATCH,
                    MATCH,
                    result
                ),
                MISMATCH
            );
        }
    }

    if (node.min === 0) {
        // allow zero match
        result = createCondition(
            MATCH,
            MATCH,
            result
        );
    } else {
        // create a match node chain to collect [0 ... min - 1] required matches
        for (var i = 0; i < node.min - 1; i++) {
            if (node.comma && result !== MATCH) {
                result = createCondition(
                    COMMA,
                    result,
                    MISMATCH
                );
            }

            result = createCondition(
                matchTerm,
                result,
                MISMATCH
            );
        }
    }

    return result;
}

function buildMatchTree(node) {
    switch (node.type) {
        case 'Group':
            var result = buildGroupMatchTree(node);

            if (node.disallowEmpty) {
                result = createCondition(
                    result,
                    NON_EMPTY,
                    MISMATCH
                );
            }

            return result;

        case 'Multiplier':
            return buildMultiplierMatchTree(node);

        case 'Function':
            return {
                type: 'Function',
                name: node.name
            };

        default:
            return node;
    }
}

function mapList(list, ref, fn) {
    var result = [];

    while (list) {
        result.unshift(fn(list));
        list = list[ref];
    }

    return result;
}

function internalMatch(tokens, syntax, syntaxes = {}) {
    function nextToken() {
        do {
            tokenCursor++;
            token = tokenCursor < tokens.length ? tokens[tokenCursor] : null;
        } while (token !== null && !/\S/.test(token.value));

        return token;
    }

    function addTokenToStack() {
        var matchToken = token;
        var matchTokenCursor = tokenCursor;

        nextToken();

        matchStack = {
            type: 'Token',
            size: matchStack.size + 1,
            syntax: syntaxNode,
            token: matchToken,
            tokenCursor: matchTokenCursor,
            prev: matchStack,
            start: matchToken === '(' || matchToken === '[',
            end: token === null || token === ')' || token === ']'
        };
    }

    function openSyntax() {
        // console.log('Open syntax', syntaxNode);
        syntaxStack = {
            syntax: syntaxNode,
            prev: syntaxStack
        };

        matchStack = {
            type: 'Open',
            size: matchStack.size,
            syntax: syntaxNode,
            token: matchStack.token,
            tokenCursor: matchStack.tokenCursor,
            prev: matchStack,
            start: true,
            end: matchStack.end
        };
    }

    function closeSyntax() {
        // console.log('Close syntax', syntaxStack.syntax);
        if (matchStack.type === 'Open') {
            matchStack = matchStack.prev;
        } else {
            matchStack = {
                type: 'Close',
                size: matchStack.size,
                syntax: syntaxStack.syntax,
                token: matchStack.token,
                tokenCursor: matchStack.tokenCursor,
                prev: matchStack,
                start: true,
                end: matchStack.end
            };
        }

        syntaxStack = syntaxStack.prev;
    }

    var matchStack = { size: 0, syntax: null, token: null, prev: null, start: true, end: false };
    var syntaxStack = null;
    var tokenCursor = -1;
    var token = nextToken();

    var ifStack = null;
    var alternative = null;
    var syntaxNode = syntax;

    var result = MISMATCH;
    var LIMIT = 5000;
    var iterationCount = 0;

    while (syntaxNode) {
        // console.log('--\n',
        //     '#' + iterationCount,
        //     require('util').inspect({
        //         match: mapList(matchStack, 'prev', x => x.type === 'Token' ? x.token && x.token.value : x.syntax ? x.type + '!' + x.syntax.name : null),
        //         token: token,
        //         tokenCursor
        //     }, { depth: null })
        // );
        // console.log(token, syntaxNode);

        // prevent infinite loop
        if (++iterationCount === LIMIT) {
            console.log(`BREAK after ${LIMIT} steps`);
            break;
        }

        if (syntaxNode === MATCH || syntaxNode === MISMATCH) {
            if (ifStack === null) {
                // console.log({ token, ifStack });

                // turn to MISMATCH when some tokens left unmatched
                if (token !== null && syntaxStack === null) {
                    syntaxNode = MISMATCH;
                }

                // try alternative match if any
                if (syntaxNode === MISMATCH && alternative !== null) {
                    ifStack = alternative;
                    alternative = alternative.alt;
                    continue;
                }

                // match or mismatch with no any alternative, return a result
                result = syntaxNode;
                break;
            }

            // fast forward match when possible
            if (syntaxNode === MATCH && ifStack.fastForwardMatch) {
                if (token !== null) {
                    syntaxNode = MISMATCH;
                } else {
                    result = MATCH;
                    break;
                }
            }

            // split
            if (syntaxNode === MATCH) {
                syntaxNode = ifStack.then;

                // save if stack top as alternative for future
                if (alternative === null || alternative.matchStack.size <= ifStack.matchStack.size) {
                    ifStack.alt = alternative;
                    alternative = ifStack;
                }

                if (syntaxStack !== null && ifStack.syntaxStack !== syntaxStack) {
                    closeSyntax();
                }
            } else {
                syntaxNode = ifStack.else;

                // restore match stack state
                syntaxStack = ifStack.syntaxStack;
                matchStack = ifStack.matchStack;
                tokenCursor = matchStack.size === 0 ? -1 : matchStack.tokenCursor;
                token = nextToken();
            }

            // console.log('trans:', ifStack.id, '=>', ifStack.prev && ifStack.prev.id);
            // console.log('pop if point to', token, matchStack, syntaxNode);
            // pop stack
            ifStack = ifStack.prev;
            continue;
        }

        if (typeof syntaxNode === 'function') {
            syntaxNode = syntaxNode(token, addTokenToStack) ? MATCH : MISMATCH;
            continue;
        }

        switch (syntaxNode.type) {
            case 'If':
                // push new conditional node to stack
                ifStack = {
                    // id: syntaxNode.id,
                    then: syntaxNode.then,
                    else: syntaxNode.else,
                    matchStack: matchStack,
                    syntaxStack: syntaxStack,
                    prev: ifStack,
                    fastForwardMatch: syntaxNode.then === MATCH && (ifStack === null || ifStack.fastForwardMatch),
                    alt: null
                };

                syntaxNode = syntaxNode.match;

                break;

            case 'DisallowEmpty':
                syntaxNode = ifStack === null || matchStack === ifStack.matchStack ? MISMATCH : MATCH;
                break;

            case 'CloseSyntax':
                closeSyntax();
                break;

            case 'Type':
            case 'Property':
                ifStack = {
                    // id: syntaxNode.id,
                    then: MATCH,
                    else: MISMATCH,
                    matchStack: matchStack,
                    syntaxStack: syntaxStack,
                    prev: ifStack,
                    fastForwardMatch: false,
                    alt: null
                };

                openSyntax();
                syntaxNode = syntaxes[syntaxNode.type === 'Type' ? 'type' : 'property'][syntaxNode.name];

                break;

            case 'Keyword':
                if (token !== null && token.value === syntaxNode.name) {
                    addTokenToStack();
                    syntaxNode = MATCH;
                } else {
                    syntaxNode = MISMATCH;
                }

                break;

            case 'Comma':
                var isCommaOnStackTop = matchStack.token && matchStack.token.value === ',';

                if (token !== null && token.value === ',') {
                    if (isCommaOnStackTop || matchStack.start) {
                        syntaxNode = MISMATCH;
                    } else {
                        addTokenToStack();
                        syntaxNode = matchStack.end ? MISMATCH : MATCH;
                    }
                } else {
                    syntaxNode = isCommaOnStackTop || matchStack.start || matchStack.end ? MATCH : MISMATCH;
                }

                break;

            case 'Token':
                if (token !== null && token.value === syntaxNode.value) {
                    addTokenToStack();
                    syntaxNode = MATCH;
                } else {
                    syntaxNode = MISMATCH;
                }

                break;

            case 'Function':
                if (token !== null && token.value.toLowerCase() === syntaxNode.name) {
                    if (tokenCursor + 1 < tokens.length && tokens[tokenCursor + 1].value === '(') {
                        addTokenToStack();
                        addTokenToStack();
                        syntaxNode = MATCH;
                    } else {
                        syntaxNode = MISMATCH;
                    }
                } else {
                    syntaxNode = MISMATCH;
                }

                break;

            // case 'Parentheses':
            // case 'String':
            default:
                console.log('Unknown node type', syntaxNode.type);
                syntaxNode = MISMATCH;
        }
    }

    while (syntaxStack) {
        closeSyntax();
    }

    console.log(iterationCount);
    totalIterationCount += iterationCount;

    return result === MATCH ? matchStack : null;
}

function match(input, matchTree, syntaxes) {
    const ast = csstree.parse(input, { context: 'value' });
    const tokens = csstree.generate(ast, {
        decorator: function(handlers) {
            var curNode = null;
            var tokens = [];

            var handlersNode = handlers.node;
            handlers.node = function(node) {
                var tmp = curNode;
                curNode = node;
                handlersNode.call(this, node);
                curNode = tmp;
            };

            handlers.chunk = function(chunk) {
                tokens.push({
                    value: chunk,
                    node: curNode
                });
            };

            handlers.result = function() {
                return tokens;
            };

            return handlers;
        }
    });
    // console.log(tokens);
    // process.exit();

    if (!syntaxes) {
        syntaxes = {};
    }

    syntaxes = {
        type: Object.assign({
            'custom-ident': function(token, addTokenToStack) {
                if (token !== null && /^[a-z-][a-z0-9-$]*$/i.test(token.value)) {
                    addTokenToStack();
                    return true;
                }

                return false;
            }
        }, syntaxes.type)
    };

    return {
        tokens,
        match: internalMatch(tokens, matchTree, syntaxes)
    };
}

function matchAsTree() {
    let cursor = match.apply(this, arguments).match;
    let host = {
        syntax: null,
        match: []
    };
    const stack = [host];

    // revert a list
    let prev = null;
    let next = null;
    while (cursor !== null) {
        next = cursor.prev;
        cursor.prev = prev;
        prev = cursor;
        cursor = next;
    }

    // init the cursor to start with 2nd item since 1st is a stub item
    cursor = prev.prev;

    // build a tree
    while (cursor !== null && cursor.syntax !== null) {
        const entry = cursor;

        switch (entry.type) {
            case 'Open':
                host.match.push(host = {
                    syntax: entry.syntax,
                    match: []
                });
                stack.push(host);
                break;

            case 'Close':
                stack.pop();
                host = stack[stack.length - 1];
                break;

            default:
                host.match.push({
                    syntax: entry.syntax,
                    token: entry.token && entry.token.value,
                    node: entry.token && entry.token.node
                });
        }

        cursor = cursor.prev;
    }

    return host;
}

// TODO: remove
process.on('exit', function() {
    console.log('TOTAL COUNT', totalIterationCount);
});

module.exports = {
    buildMatchTree: function(str) {
        const ast = csstree.grammar.parse(str);
        id = 1; // TODO: remove
        return buildMatchTree(ast);
    },
    match: function() {
        const res = match.apply(this, arguments);

        return {
            tokens: res.tokens,
            result: res.match !== null ? MATCH : MISMATCH,
            match: mapList(res.match, 'prev', function(item) {
                if (item.type === 'Open' || item.type === 'Close') {
                    return { type: item.type, syntax: item.syntax };
                }
                return {
                    syntax: item.syntax,
                    token: item.token && item.token.value,
                    node: item.token && item.token.node
                };
            }).slice(1)
        };
    },
    matchAsTree
};
