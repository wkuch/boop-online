const express = require('express');
const BOARD_SIZE = 6;
const http = require('http');
const socketIo = require('socket.io');

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let players = {};
let currentPlayer = null;
let gameBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)); // BOARD_SIZE x BOARD_SIZE board
let gameActive = false;
let playerSymbols = ['P1', 'P2']; // Placeholder for player 1 and player 2 pieces
let playerColors = { P1: 'Player 1 (Red)', P2: 'Player 2 (Blue)' };

// Helper function to perform the booping
function boopPieces(board, placedRow, placedCol) {
    console.log(`[DEBUG] boopPieces called for piece at [${placedRow}, ${placedCol}]`);
    const boopingPiece = board[placedRow][placedCol];
    if (!boopingPiece) return; // Should not happen

    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const neighborRow = placedRow + dr;
        const neighborCol = placedCol + dc;

        if (neighborRow >= 0 && neighborRow < BOARD_SIZE && neighborCol >= 0 && neighborCol < BOARD_SIZE) {
            const pieceToBoop = board[neighborRow][neighborCol];
            if (pieceToBoop) {
                // Rule: A kitten cannot boop a cat. (For now, only kittens exist)
                if (boopingPiece.type === 'kitten' && pieceToBoop.type === 'cat') {
                    continue;
                }

                const targetRow = neighborRow + dr;
                const targetCol = neighborCol + dc;

                if (targetRow >= 0 && targetRow < BOARD_SIZE && targetCol >= 0 && targetCol < BOARD_SIZE) {
                    // Target is on the board
                    if (board[targetRow][targetCol] === null) { // Target is empty, move the piece
                        console.log(`[DEBUG] Booping piece from [${neighborRow}, ${neighborCol}] to [${targetRow}, ${targetCol}]`);
                        board[targetRow][targetCol] = pieceToBoop;
                        board[neighborRow][neighborCol] = null;
                    } else {
                        // Target is occupied, pieceToBoop does not move.
                    }
                } else {
                    // Target is off the board, remove the piece
                    console.log(`[DEBUG] Booping piece from [${neighborRow}, ${neighborCol}] off board.`);
                    board[neighborRow][neighborCol] = null;
                }
            }
        }
    }
}

// Helper function to check for kitten promotion
function checkForKittenPromotion(board, playerSymbol, outCatCoordinate) {
    // outCatCoordinate is an object like {row: null, col: null} to be filled if a promotion occurs.
    // Returns true if a promotion was made in this pass, false otherwise.
    console.log(`[DEBUG] checkForKittenPromotion loop called for player ${playerSymbol}`);
    for (let cr = 0; cr < BOARD_SIZE; cr++) {
        for (let cc = 0; cc < BOARD_SIZE; cc++) {
            // Defines lines where (cr,cc) is the first (e.g., top-leftmost) piece.
            const lineChecks = [
                { type: "H", p1: [cr,cc], p2: [cr,cc+1], p3: [cr,cc+2] }, // Horizontal
                { type: "V", p1: [cr,cc], p2: [cr+1,cc], p3: [cr+2,cc] }, // Vertical
                { type: "DDR", p1: [cr,cc], p2: [cr+1,cc+1], p3: [cr+2,cc+2] }, // Diagonal Down-Right
                { type: "DUR", p1: [cr,cc], p2: [cr-1,cc+1], p3: [cr-2,cc+2] }  // Diagonal Up-Right (cr,cc is bottom-left)
            ];

            for (const line of lineChecks) {
                const coords = [line.p1, line.p2, line.p3];
                let allKittensOfPlayer = true;
                let onBoard = true;

                for (const coord of coords) {
                    const r_coord = coord[0];
                    const c_coord = coord[1];
                    if (r_coord < 0 || r_coord >= BOARD_SIZE || c_coord < 0 || c_coord >= BOARD_SIZE) {
                        onBoard = false;
                        break;
                    }
                    const piece = board[r_coord][c_coord];
                    if (!piece || piece.type !== 'kitten' || piece.player !== playerSymbol) {
                        allKittensOfPlayer = false;
                        break;
                    }
                }

                if (onBoard && allKittensOfPlayer) {
                    const k1_pos = coords[0];
                    const k2_pos = coords[1]; // Cat will be placed here (middle)
                    const k3_pos = coords[2];

                    console.log(`[DEBUG] Promoting kitten to cat for ${playerSymbol}. Line type ${line.type}: [${k1_pos}], [${k2_pos}], [${k3_pos}]`);

                    const promotingPlayerSocketId = Object.keys(players).find(id => players[id].symbol === playerSymbol);
                    if (promotingPlayerSocketId && players[promotingPlayerSocketId].catsInSupply > 0) {
                        board[k1_pos[0]][k1_pos[1]] = null;
                        board[k3_pos[0]][k3_pos[1]] = null;
                        board[k2_pos[0]][k2_pos[1]] = { type: 'cat', player: playerSymbol }; // Place cat in middle
                        
                        players[promotingPlayerSocketId].catsInSupply--; // Decrement supply
                        // Counts will be updated globally later in makeMove

                        outCatCoordinate.row = k2_pos[0];
                        outCatCoordinate.col = k2_pos[1];
                        
                        console.log(`[DEBUG] Normal promotion for ${playerSymbol}. Cats left: ${players[promotingPlayerSocketId].catsInSupply}`);
                        return true; // Promoted one line, exit for re-scan from makeMove
                    } else {
                        console.log(`[DEBUG] Promotion for ${playerSymbol} skipped, no cats in supply.`);
                        return false; // Cannot promote if no cats in supply
                    }

                }
            }
        }
    }
    return false; // No promotion found in this full pass
}

// Helper function to check for a win condition (three cats in a row)
function updatePlayerPieceCounts(board, playersMap) {
    // Reset counts
    for (const id in playersMap) {
        playersMap[id].kittensOnBoard = 0;
        playersMap[id].catsOnBoard = 0;
    }
    // Recalculate
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            if (piece) {
                const playerSocketId = Object.keys(playersMap).find(id => playersMap[id].symbol === piece.player);
                if (playerSocketId) {
                    if (piece.type === 'kitten') {
                        playersMap[playerSocketId].kittensOnBoard++;
                    } else if (piece.type === 'cat') {
                        playersMap[playerSocketId].catsOnBoard++;
                    }
                }
            }
        }
    }
    console.log(`[DEBUG] Piece counts updated: P1 Kittens: ${Object.values(playersMap)[0]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[0]?.catsOnBoard}, Supply: ${Object.values(playersMap)[0]?.catsInSupply} | P2 Kittens: ${Object.values(playersMap)[1]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[1]?.catsOnBoard}, Supply: ${Object.values(playersMap)[1]?.catsInSupply}`);
}

function checkForWin(board, playerSymbol) {
    const lines = [
        // Horizontal
        [[0,0],[0,1],[0,2]], [[0,1],[0,2],[0,3]], [[0,2],[0,3],[0,4]], [[0,3],[0,4],[0,5]],
        [[1,0],[1,1],[1,2]], [[1,1],[1,2],[1,3]], [[1,2],[1,3],[1,4]], [[1,3],[1,4],[1,5]],
        [[2,0],[2,1],[2,2]], [[2,1],[2,2],[2,3]], [[2,2],[2,3],[2,4]], [[2,3],[2,4],[2,5]],
        [[3,0],[3,1],[3,2]], [[3,1],[3,2],[3,3]], [[3,2],[3,3],[3,4]], [[3,3],[3,4],[3,5]],
        [[4,0],[4,1],[4,2]], [[4,1],[4,2],[4,3]], [[4,2],[4,3],[4,4]], [[4,3],[4,4],[4,5]],
        [[5,0],[5,1],[5,2]], [[5,1],[5,2],[5,3]], [[5,2],[5,3],[5,4]], [[5,3],[5,4],[5,5]],
        // Vertical
        [[0,0],[1,0],[2,0]], [[1,0],[2,0],[3,0]], [[2,0],[3,0],[4,0]], [[3,0],[4,0],[5,0]],
        [[0,1],[1,1],[2,1]], [[1,1],[2,1],[3,1]], [[2,1],[3,1],[4,1]], [[3,1],[4,1],[5,1]],
        [[0,2],[1,2],[2,2]], [[1,2],[2,2],[3,2]], [[2,2],[3,2],[4,2]], [[3,2],[4,2],[5,2]],
        [[0,3],[1,3],[2,3]], [[1,3],[2,3],[3,3]], [[2,3],[3,3],[4,3]], [[3,3],[4,3],[5,3]],
        [[0,4],[1,4],[2,4]], [[1,4],[2,4],[3,4]], [[2,4],[3,4],[4,4]], [[3,4],[4,4],[5,4]],
        [[0,5],[1,5],[2,5]], [[1,5],[2,5],[3,5]], [[2,5],[3,5],[4,5]], [[3,5],[4,5],[5,5]],
        // Diagonal (top-left to bottom-right)
        [[0,0],[1,1],[2,2]], [[1,1],[2,2],[3,3]], [[2,2],[3,3],[4,4]], [[3,3],[4,4],[5,5]],
        [[0,1],[1,2],[2,3]], [[1,2],[2,3],[3,4]], [[2,3],[3,4],[4,5]],
        [[0,2],[1,3],[2,4]], [[1,3],[2,4],[3,5]],
        [[0,3],[1,4],[2,5]],
        [[1,0],[2,1],[3,2]], [[2,1],[3,2],[4,3]], [[3,2],[4,3],[5,4]],
        [[2,0],[3,1],[4,2]], [[3,1],[4,2],[5,3]],
        [[3,0],[4,1],[5,2]],
        // Diagonal (bottom-left to top-right)
        [[5,0],[4,1],[3,2]], [[4,1],[3,2],[2,3]], [[3,2],[2,3],[1,4]], [[2,3],[1,4],[0,5]],
        [[5,1],[4,2],[3,3]], [[4,2],[3,3],[2,4]], [[3,3],[2,4],[1,5]],
        [[5,2],[4,3],[3,4]], [[4,3],[3,4],[2,5]],
        [[5,3],[4,4],[3,5]],
        [[4,0],[3,1],[2,2]], [[3,1],[2,2],[1,3]], [[2,2],[1,3],[0,4]],
        [[3,0],[2,1],[1,2]], [[2,1],[1,2],[0,3]],
        [[2,0],[1,1],[0,2]]
    ];

    for (const line of lines) {
        const [p1, p2, p3] = line;
        const piece1 = board[p1[0]][p1[1]];
        const piece2 = board[p2[0]][p2[1]];
        const piece3 = board[p3[0]][p3[1]];

        if (piece1 && piece1.type === 'cat' && piece1.player === playerSymbol &&
            piece2 && piece2.type === 'cat' && piece2.player === playerSymbol &&
            piece3 && piece3.type === 'cat' && piece3.player === playerSymbol) {
            return true; // Win detected
        }
    }
    return false; // No win
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    if (Object.keys(players).length < 2) {
        const playerSymbol = Object.keys(players).length === 0 ? playerSymbols[0] : playerSymbols[1];
        players[socket.id] = {
            id: socket.id,
            symbol: playerSymbol,
            name: playerColors[playerSymbol],
            kittensOnBoard: 0,
            catsOnBoard: 0,
            catsInSupply: 3, // Max 3 cats per player
            totalPiecesAllowed: 8
        };
        socket.emit('playerAssignment', { playerId: socket.id, symbol: playerSymbol, name: playerColors[playerSymbol] });
        console.log('Player assigned:', players[socket.id]);

        if (Object.keys(players).length === 2 && !gameActive) {
            gameActive = true;
            currentPlayer = playerSymbols[0]; // Player 1 starts
            updatePlayerPieceCounts(gameBoard, players); // Initial counts at game start
            // No special promotion offer at the very beginning of the game.
            // It will be offered at the end of a player's turn or at the start of the next player's turn if conditions are met.
            io.emit('gameState', { board: gameBoard, currentPlayer: playerColors[currentPlayer], message: `${playerColors[currentPlayer]} starts.` });
            console.log('Game started. Current player:', playerColors[currentPlayer]);
        }
    } else {
        socket.emit('gameFull', 'Sorry, the game is full.');
        socket.disconnect(true);
        return;
    }

    socket.on('makeMove', (data) => {
        if (!gameActive || socket.id !== Object.keys(players).find(id => players[id].symbol === currentPlayer)) {
            socket.emit('invalidMove', 'Not your turn or game not active.');
            return;
        }

        const { row, col } = data;
        const player = players[socket.id];

        // Check if player is allowed to place a new kitten (less than 8 pieces on board)
        // This count should be up-to-date from the end of the PREVIOUS turn.
        // Or, if special promotion is active, this check is bypassed as it's a different action.
        const pDataCurrent = players[socket.id];
        if ((pDataCurrent.kittensOnBoard + pDataCurrent.catsOnBoard) >= pDataCurrent.totalPiecesAllowed) {
            // Exception: If they have exactly 8 pieces and offerSpecialPromotion is available, they might be trying to click a kitten for it.
            // However, makeMove is for placing new pieces. executeSpecialPromotion handles the upgrade.
            // So, if 8 pieces are on board, no new piece can be placed via makeMove.
            socket.emit('actionError', { message: 'You already have 8 pieces on the board. Cannot place new kitten unless through special promotion.' });
            console.log(`[INFO] ${player.name} tried to place kitten with 8 pieces on board. Move rejected.`);
            return;
        }

        // Basic move validation (can cell be played?)
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE || gameBoard[row][col] !== null) {
            socket.emit('invalidMove', 'Invalid move. Cell is out of bounds or already occupied.');
            return;
        }

        // Place the kitten
        gameBoard[row][col] = { type: 'kitten', player: player.symbol };
        const placedPiecePlayerName = players[socket.id].name;
        console.log(`[DEBUG] makeMove: ${placedPiecePlayerName} placed kitten at [${row},${col}]. Current player symbol: ${player.symbol}. About to call boopPieces.`);
        
        // Perform booping for the placed kitten
        boopPieces(gameBoard, row, col);

        let message = `Move made by ${placedPiecePlayerName}.`;
        console.log(`[DEBUG] makeMove: After first boopPieces for [${row},${col}]. About to call checkForKittenPromotion.`);

        // Check for kitten promotion (can be cascading)
        let promotionOccurredThisTurn = false;
        let overallNewlyPlacedCatsForBooping = [];
        let singlePromotionCheckResult;

        do {
            let newlyPlacedCatInThisPass = { row: -1, col: -1 }; 
            singlePromotionCheckResult = checkForKittenPromotion(gameBoard, player.symbol, newlyPlacedCatInThisPass);
            if (singlePromotionCheckResult) {
                promotionOccurredThisTurn = true;
                overallNewlyPlacedCatsForBooping.push({row: newlyPlacedCatInThisPass.row, col: newlyPlacedCatInThisPass.col});
            }
        } while (singlePromotionCheckResult);

        if (promotionOccurredThisTurn) {
            message = `${player.name} promoted kitten(s) to cat(s)! New cat(s) also boop.`;
            console.log(`${player.name} promoted kittens. Cats placed at: ${JSON.stringify(overallNewlyPlacedCatsForBooping)}`);
            for (const catCoord of overallNewlyPlacedCatsForBooping) {
                boopPieces(gameBoard, catCoord.row, catCoord.col); // Boop for each new cat
            }
        }

        // Check for win condition (three cats in a row)
        if (checkForWin(gameBoard, player.symbol)) {
            gameActive = false;
            message = `${player.name} WINS with three cats in a row! Game Over.`;
            io.emit('gameOver', { winnerName: player.name, board: gameBoard });
            io.emit('gameState', { board: gameBoard, currentPlayer: null, message: message }); // Update final state
            console.log(message);
            updatePlayerPieceCounts(gameBoard, players); // Update counts on game end
        } else {
            // Switch player if game is still active
            // currentPlayer switch was here, removed as it's done later.
            updatePlayerPieceCounts(gameBoard, players); // Update counts for the player who just moved.

            // Offer special promotion to the player who just finished their turn, if they qualify.
            const actingPlayerSocketId = socket.id;
            if (players[actingPlayerSocketId]) {
                const pData = players[actingPlayerSocketId];
                if (pData.kittensOnBoard === 8 && // Condition: Exactly 8 kittens on board
                    pData.catsInSupply > 0 && 
                    pData.kittensOnBoard > 0) { // kittensOnBoard > 0 is redundant if kittensOnBoard === 8, but keep for clarity or future rule changes
                    console.log(`[DEBUG] Offering special promotion to ${pData.name} after their move sequence.`);
                    socket.emit('offerSpecialPromotion', { message: 'You have 8 kittens on board and can upgrade a kitten!' });
                }
            }

            // Switch player
            currentPlayer = (currentPlayer === playerSymbols[0]) ? playerSymbols[1] : playerSymbols[0];
            message += ` It's ${playerColors[currentPlayer]}'s turn.`;
            
            // Offer special promotion to the NEW current player if they now qualify.
            const newCurrentPlayerSocketId = Object.keys(players).find(id => players[id].symbol === currentPlayer);
            if (newCurrentPlayerSocketId && players[newCurrentPlayerSocketId]) {
                const nextPData = players[newCurrentPlayerSocketId];
                if (nextPData.kittensOnBoard === 8 && 
                    nextPData.catsInSupply > 0 && 
                    nextPData.kittensOnBoard > 0) {
                    console.log(`[DEBUG] Offering special promotion to ${nextPData.name} at the start of their turn.`);
                    io.to(newCurrentPlayerSocketId).emit('offerSpecialPromotion', { message: 'You have 8 kittens on board and can upgrade a kitten!' });
                }
            }

            io.emit('gameState', { board: gameBoard, currentPlayer: playerColors[currentPlayer], message: message });
            console.log(`Current player: ${playerColors[currentPlayer]}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (players[socket.id]) {
            const disconnectedPlayerName = players[socket.id].name;
            delete players[socket.id];
            // Reset game if a player disconnects
            const wasGameActiveBeforeDisconnect = gameActive;
            delete players[socket.id];
            // Reset game if a player disconnects
            gameActive = false; // Always set to false initially after a disconnect or game end
            gameBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            // Reset player piece counts and supply for a new game
            for (const id in players) {
                if(players[id]) { // Ensure player exists
                    players[id].kittensOnBoard = 0;
                    players[id].catsOnBoard = 0;
                    players[id].catsInSupply = 3; // Reset supply
                }
            }
            if (Object.keys(players).length < 2) {
                 // If game was active and a player left, other player might be waiting
                const resetMessage = wasGameActiveBeforeDisconnect 
                    ? `${disconnectedPlayerName} has disconnected. Game reset. Waiting for new opponent.` 
                    : `Game was over. ${disconnectedPlayerName} left. Ready for a new game. Waiting for players.`;
                io.emit('playerDisconnected', resetMessage);
                console.log(resetMessage);
                players = {}; // Fully clear players if we are resetting for a new game for sure.
            } else {
                // This case (2 players still connected, but one disconnected and reconnected as a new ID) is less common
                // but ensures the game state is clean. If one player left from an active game, and another is still there,
                // the above 'if' handles it. This 'else' is more of a fallback.
                io.emit('playerDisconnected', `${disconnectedPlayerName} has disconnected. State check.`); 
            }
            // gameActive will be set to true again when two players are connected in the 'connection' handler
        }
    });

    socket.on('executeSpecialPromotion', (data) => {
        const player = players[socket.id];
        if (!player || !gameActive || player.symbol !== currentPlayer) {
            socket.emit('actionError', { message: 'Cannot perform special promotion now. Not your turn or game inactive.' });
            console.log(`[ERROR] Invalid special promotion attempt by ${player ? player.name : 'Unknown'}. Current player: ${currentPlayer}, Player symbol: ${player ? player.symbol : 'N/A'}`);
            return;
        }

        const { row, col } = data;
        if (row === undefined || col === undefined || row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            socket.emit('actionError', { message: 'Invalid coordinates for special promotion.' });
            console.log(`[ERROR] Invalid coordinates for special promotion by ${player.name}: [${row},${col}]`);
            return;
        }

        const playerRecord = players[socket.id]; // Player data for the current player
        const piece = gameBoard[row][col];

        // Validate: Must have 8 KITTENS on board for THIS special promotion rule
        if (playerRecord.kittensOnBoard !== 8) { 
            socket.emit('actionError', { message: 'Condition for special promotion (8 kittens on board) no longer met.' });
            console.log(`[DEBUG] executeSpecialPromotion rejected for ${playerRecord.name}: kittensOnBoard is ${playerRecord.kittensOnBoard}, not 8.`);
            socket.emit('hideSpecialPromotion'); 
            return;
        }

        // Ensure the selected piece is indeed the player's own kitten
        if (!piece || piece.type !== 'kitten' || piece.player !== playerRecord.symbol) {
            socket.emit('actionError', { message: 'Invalid piece selected for special promotion. Must be your own kitten.' });
            console.log(`[DEBUG] executeSpecialPromotion rejected for ${playerRecord.name}: Invalid piece. Expected own kitten at [${row},${col}], got ${JSON.stringify(piece)}. Player symbol: ${playerRecord.symbol}`);
            // Offer remains, player can try again with a different piece.
            return; 
        }

        // Ensure player has cats in supply
        if (playerRecord.catsInSupply <= 0) {
            socket.emit('actionError', { message: 'No cats in supply to perform special promotion.' });
            console.log(`[DEBUG] executeSpecialPromotion rejected for ${playerRecord.name}: No cats in supply.`);
            socket.emit('hideSpecialPromotion'); // Offer is void if no supply
            return;
        }

        console.log(`[INFO] ${player.name} executes special promotion at [${row},${col}]`);
        let message = `${player.name} performed a special upgrade at [${row},${col}].`;

        // Perform upgrade
        gameBoard[row][col] = { type: 'cat', player: player.symbol };
        playerRecord.catsInSupply--;
        // Piece counts (kittensOnBoard, catsOnBoard) will be updated by updatePlayerPieceCounts shortly.
        console.log(`[DEBUG] Special promotion for ${player.symbol}. Cats left in supply: ${playerRecord.catsInSupply}`);
        console.log(`[DEBUG] Special promotion for ${player.symbol}. Cats left in supply: ${pData.catsInSupply}`);

        // Boop pieces around the newly formed CAT
        const boopedPiecesFromSpecial = boopPieces(gameBoard, row, col);
        if (boopedPiecesFromSpecial.length > 0) {
            message += ` The new cat booped ${boopedPiecesFromSpecial.length} piece(s).`;
            console.log(`[DEBUG] New cat from special promotion booped ${boopedPiecesFromSpecial.length} piece(s).`);
        }
        updatePlayerPieceCounts(gameBoard, players); // Update counts after booping

        // Check for cascading KITTEN promotions caused by the booping
        let promotionOccurredAgain;
        do {
            promotionOccurredAgain = false;
            const outCatCoordinateAgain = { row: null, col: null };
            if (checkForKittenPromotion(gameBoard, player.symbol, outCatCoordinateAgain)) {
                promotionOccurredAgain = true;
                message += ` ${player.name} got another promotion!`;
                console.log(`[DEBUG] Cascading kitten promotion for ${player.name} at [${outCatCoordinateAgain.row},${outCatCoordinateAgain.col}] after special upgrade.`);
                
                const boopedPiecesFromPromotion = boopPieces(gameBoard, outCatCoordinateAgain.row, outCatCoordinateAgain.col);
                if (boopedPiecesFromPromotion.length > 0) {
                    message += ` That new cat booped ${boopedPiecesFromPromotion.length} piece(s).`;
                    console.log(`[DEBUG] Cat from cascading promotion booped ${boopedPiecesFromPromotion.length} piece(s).`);
                }
                updatePlayerPieceCounts(gameBoard, players); // Update counts after each promotion and subsequent boop
            }
        } while (promotionOccurredAgain);
        // Final count update before win check / turn switch.
        updatePlayerPieceCounts(gameBoard, players);

        // Check for win condition
        if (checkForWin(gameBoard, player.symbol)) {
            gameActive = false;
            message = `${player.name} WINS with three cats in a row (after special upgrade)! Game Over.`;
            io.emit('gameOver', { winnerName: player.name, board: gameBoard });
            io.emit('gameState', { board: gameBoard, currentPlayer: null, message: message });
            console.log(message);
            updatePlayerPieceCounts(gameBoard, players); // Final counts update on game end
        } else {
            // Switch player
            currentPlayer = (currentPlayer === playerSymbols[0]) ? playerSymbols[1] : playerSymbols[0];
            message += ` ${playerColors[currentPlayer]}'s turn.`;
            
            // Offer special promotion to the NEXT player if they meet conditions
            const nextPlayerSocketId = Object.keys(players).find(id => players[id].symbol === currentPlayer);
            if (nextPlayerSocketId) {
                const nextPData = players[nextPlayerSocketId];
                if ((nextPData.kittensOnBoard + nextPData.catsOnBoard) === nextPData.totalPiecesAllowed && 
                    nextPData.catsInSupply > 0 && 
                    nextPData.kittensOnBoard > 0) {
                    console.log(`[DEBUG] Offering special promotion to next player ${nextPData.name}`);
                    io.to(nextPlayerSocketId).emit('offerSpecialPromotion', { message: 'You have 8 pieces on board and can upgrade a kitten!' });
                }
            }
            io.emit('gameState', { board: gameBoard, currentPlayer: playerColors[currentPlayer], message: message });
            console.log(`Current player: ${playerColors[currentPlayer]}`);
        }
    });

});

server.listen(port, () => console.log(`Listening on port ${port}`));
