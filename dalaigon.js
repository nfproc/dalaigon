/* dalaigon for Phaser3 (v2.00), ported from MieruPC2010              */
/*                                           2024-09-08 Naoki FUJEDA  */
/**********************************************************************/

// game environment (global constants / utility functions / ranking)
class GameEnvironment {
    constructor() {
        this.baseURL = 'http://localhost:8000/';

        this.WIDTH  = 10;
        this.LEFT   = 1;
        this.RIGHT  = 8;
        this.HEIGHT = 16;
        this.TOP    = 2;
        this.BOTTOM = 14;
        this.fieldLeft   = -40;
        this.fieldTop    = -40;
        this.blockWidth  = 60;
        this.blockHeight = 40;
        this.wallWidth   = 20;
        this.wallHeight  = 20;

        this.highScore = [5000, 4000, 3000, 2500, 2000, 1500, 1000];
        this.highLevel = [10, 8, 6, 4, 3, 2, 1];
        this.highErase = [80, 60, 50, 40, 30, 25, 20];
        this.chainMulti = [1, 4, 8, 16, 24, 32, 48, 64, 80, 100, 120, 140,
                           160, 180, 200, 240, 280, 320, 360, 400];
        this.lengthBase = [5, 10, 16, 23, 31, 40, 50];
        this.diagTable = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20];
        this.startLevel = 0;
        this.lastRank = -1;
    }

    // update ranking, player must be a GamePlayer instance after game over
    updateRank(player) {
        let rank = 0;
        for (rank = 0; rank < 7; rank++)
            if (player.score > this.highScore[rank])
                break;
        this.lastRank = rank;
        if (rank == 7)
            return;
        for (let i = 5; i >= rank; i--) {
            this.highScore[i + 1] = this.highScore[i];
            this.highErase[i + 1] = this.highErase[i];
            this.highLevel[i + 1] = this.highLevel[i];
        }
        this.highScore[rank] = player.score;
        this.highErase[rank] = player.erase;
        this.highLevel[rank] = player.level;
    }

    rgb(r, g, b) {
        return 'rgb(' + r.toString() + ', ' + g.toString() + ', ' + b.toString() + ')';
    }
}
var env = new GameEnvironment();

/**********************************************************************/
// game player (score and falling blocks)
class GamePlayer {
    constructor(startLevel, topScore) {
        this.tailX = [ 1,  1, -1, -1];
        this.tailY = [-1,  1,  1, -1];

        this.score = 0;
        this.topScore = topScore;
        this.increasedScore = 0;
        this.level = startLevel;
        this.erase = 0;
        this.chain = 0;
        this.diagMulti = 0;
        this.startLevel = startLevel;

        this.blockProb = [5, 5, 5, 5, 5];
        this.blockX = 0;
        this.blockY = 0;
        this.blockLastRotate = 0;
        this.blockRotate = 0;
        this.blockColor = [0, 0, 0];
        this.nextBlockColor = [0, 0, 0];
        this.fallTime = 0;
        this.lockTime = 0;
        this.calcSpeed();
    }

    // calculate falling speed (in 1/60 G) and time to lock
    calcSpeed() {
        const base = [1, 2, 3, 5, 10, 2, 4, 6, 10, 20];
        const mult = [1, 1, 2, 3, 4, 4, 4, 6, 6, 6];
        this.speed = base[this.level % 10] * mult[Math.floor(this.level / 10)];
        this.maxColor = (this.level >= 10) ? 5 : 4;
        this.lockMax = Math.min(45, 70 - Math.floor(this.level / 2));
    }

    // check if the falling blocks will hit the field
    checkBlockHit(field, dx, dy, rot) {
        let x = this.blockX + dx;
        let y = this.blockY + dy;
        if (y == 0)
            return true;
        if (field.get(x, y) != 0)
            return true;
        if (field.get(x + this.tailX[rot], y) != 0)
            return true;
        if (field.get(x, y + this.tailY[rot]) != 0)
            return true;
        return false;
    }

    // move falling blocks left/right
    moveCurrentBlock(field, dir) {
        if (! this.checkBlockHit(field, dir, 0, this.blockRotate))
            this.blockX += dir;
    }

    // rotate falling blocks left/right
    rotateCurrentBlock(field, dir) {
        let rot = (this.blockRotate + dir + 4) % 4;
        if (! this.checkBlockHit(field, 0, 0, rot)) {
            this.blockRotate = rot;
        } else if (! this.checkBlockHit(field, 0, -this.tailY[rot], rot)) {
            this.blockY -= this.tailY[rot];
            this.blockRotate = rot;
            this.fallTime = 59;
        } else if (! this.checkBlockHit(field, -this.tailX[rot], 0, rot)) {
            this.blockX -= this.tailX[rot];
            this.blockRotate = rot;
        }
    }

    // fall the blocks (w/o drop button)
    fallCurrentBlock(field) {
        this.fallTime += this.speed;
        while (this.fallTime >= 60) {
            if (! this.checkBlockHit(field, 0, 1, this.blockRotate)) {
                this.blockY++;
                this.fallTime = Math.max(this.fallTime - 60, 0);
            } else {
                this.fallTime = 59;
                this.lockTime++;
            }
        }
    }

    // fall the blocks (w/ drop button)
    dropCurrentBlock(field) {
        if (! this.checkBlockHit(field, 0, 1, this.blockRotate)) {
            this.blockY++;
            this.fallTime = 0;
            this.increaseScore(1);
        } else {
            this.fallTime = 59;
            this.lockTime = 99;
        }
    }

    // fix the falling blocks to the field
    placeCurrentBlock(field) {
        field.put(this.blockColor[0], this.blockX, this.blockY);
        field.put(this.blockColor[1 + this.blockRotate % 2],
            this.blockX, this.blockY + this.tailY[this.blockRotate]);
        field.put(this.blockColor[2 - this.blockRotate % 2],
            this.blockX + this.tailX[this.blockRotate], this.blockY);
        for (let i = 0; i < 3; i++)
            this.blockColor[i] = 0;
    }

    // spawn the falling block (can rotate by pressing a rotate button)
    generateCurrentBlock(field, rot) {
        this.setNextBlock();
        this.blockY = env.TOP;
        this.blockX = env.LEFT + 3;
        this.blockRotate = 0;
        this.chain = 0;
        if (field.get(this.blockX - 1, this.blockY) != 0 && rot == 3)
            this.blockX--;
        this.fallTime = 0;
        this.lockTime = 0;
        if (rot != 0)
            this.rotateCurrentBlock(field, rot);
        return (field.get(this.blockX, this.blockY) == 0 && 
                field.get(this.blockX + 1, this.blockY) == 0);
    }

    // reflect the falling block to game screen
    updateCurrentBlock(block) {
        for (let i = 0; i < 3; i++) {
            block[i].setFrame(this.blockColor[i]);
            let pos = this.getBlockPosition(i, this.blockRotate);
            let lpos = this.getBlockPosition(i, this.blockLastRotate);
            block[i].setPosition((pos[0] + lpos[0]) / 2, (pos[1] + lpos[1]) / 2);
            block[i].setVisible(this.blockColor[i] != 0);
        }
    }

    // calculate the position of the falling blocks (called by updateCurrentBlock)
    getBlockPosition(index, rotate) {
        let x = env.fieldLeft + (this.blockX + 0.5) * env.blockWidth;
        let y = env.fieldTop + (this.blockY + 0.5) * env.blockHeight;
        if (this.fallTime + this.speed < 60)
            y -= (60 - this.fallTime) * env.blockHeight / 60;
        if (index == 1 + rotate % 2)
            y += this.tailY[rotate] * env.blockHeight;
        if (index == 2 - rotate % 2)
            x += this.tailX[rotate] * env.blockWidth;
        return [x, y];
    }

    // determine the colors of the next blocks
    setNextBlock() {
        for (let i = 0; i < 3; i++) {
            let total = this.blockProb.slice(0, this.maxColor).reduce((s, x) => s + x, 0);
            let num = Phaser.Math.RND.integerInRange(0, total - 1);
            let col = 0;
            for (col = 0; col < this.maxColor; col++) {
                num -= this.blockProb[col];
                if (num < 0)
                    break;
            }
            this.blockProb[col]--;
            this.blockColor[i] = this.nextBlockColor[i];
            this.nextBlockColor[i] = col + 1;
            if (total <= 4 * this.maxColor + 1)
                for (let j = 0; j < this.maxColor; j++)
                    this.blockProb[j]++;
        }
    }

    // reflect the next block to game screen
    updateNextBlock(block) {
        for (let i = 0; i < 3; i++)
            block[i].setFrame(this.nextBlockColor[i]);
    }

    // increase the score (and the high score if needed)
    increaseScore(inc) {
        this.increasedScore = inc * env.diagTable[this.diagMulti];
        this.score += this.increasedScore;
        this.score = Math.min(999999999, this.score);
        this.topScore = Math.max(this.score, this.topScore);
    }
}

/**********************************************************************/
// manage how long each of the keys is pressed
class GameKeyManager {
    constructor(kb) {
        this.clear();
        this.updateAcc();
        this.keys = kb.addKeys("S,A,D,J,K,H,R");
        this.kb = kb;
    }

    clear() {
        this.left  = false;
        this.right = false;
        this.rotL  = false;
        this.rotR  = false;
        this.drop  = false;
        this.help  = false;
        this.rank  = false;
    }

    updateAcc() {
        this.accLeft  = (this.left)  ? this.accLeft + 1 : 0;
        this.accRight = (this.right) ? this.accRight + 1 : 0;
        this.accRotL  = (this.rotL)  ? this.accRotL  + 1 : 0;
        this.accRotR  = (this.rotR)  ? this.accRotR  + 1 : 0;
        this.accDrop  = (this.drop)  ? this.accDrop  + 1 : 0;
        this.accHelp  = (this.help)  ? this.accHelp  + 1 : 0;
        this.accRank  = (this.rank)  ? this.accRank  + 1 : 0;
    }

    updateKeys() {
        this.left  = this.keys.A.isDown;
        this.right = this.keys.D.isDown;
        this.rotL  = this.keys.J.isDown;
        this.rotR  = this.keys.K.isDown;
        this.drop  = this.keys.S.isDown;
        this.help  = this.keys.H.isDown;
        this.rank  = this.keys.R.isDown;
    }

    stopCapture() {
        this.kb.removeAllKeys();
    }
}

/**********************************************************************/
// get/set the color of the block in the field (for code readability)
class GameFieldManager {
    constructor(field) {
        this.field = field;
    }

    get(x, y) {
        return this.field.getTileAt(x, y).index;
    }

    put(i, x, y) {
        this.field.getTileAt(x, y).index = i;
    }
}

/**********************************************************************/
// Scene for the title screen
class TitleScreen extends Phaser.Scene {
    constructor( ...args ) {
        super({ key: 'title', ...args })
    }

    preload() {
        this.defaultFont = { fontFamily: '"Share Tech Mono"', color: "#000", fontSize: "36px" };
        this.load.setBaseURL(env.baseURL);
        this.load.image('title', 'img/dalaigon.png');
    }

    create() {
        this.add.image(400, 140, 'title');
        this.add.text(468, 280, 'dalaigon v2.00', this.defaultFont);
        this.add.text(585, 320, 'for Phaser3', this.defaultFont);
        this.add.text(175, 400, 'HIGH SCORE:', this.defaultFont);
        this.add.text(624, 400, env.highScore[0].toLocaleString('ja-JP'), this.defaultFont).setOrigin(1, 0);
        this.add.text(175, 440, 'START LEVEL:', this.defaultFont);
        this.add.text(195, 520, 'A/D: Start Level -/+', this.defaultFont);
        this.add.text(117, 560, 'H: Help  R: Ranking  J: Start', this.defaultFont);
        this.levelIndicator = this.add.text(429, 440, "*", this.defaultFont);
        this.levelIndicatorFlag = 0;
        this.levelText = this.add.text(624, 440, "0", this.defaultFont).setOrigin(1, 0);
        this.kb = new GameKeyManager(this.input.keyboard);
    }

    update() {
        let nextScene = '';
        this.kb.updateKeys();
        this.kb.updateAcc();
        if (this.kb.accLeft == 1)
            env.startLevel = Math.max(0, env.startLevel - 10);
        if (this.kb.accRight == 1)
            env.startLevel = Math.min(50, env.startLevel + 10);
        if (this.kb.accRank == 1)
            nextScene = 'rank';
        if (this.kb.accHelp == 1)
            nextScene = 'help';
        if (this.kb.accRotL == 1)
            nextScene = 'game';

        this.levelText.setText(env.startLevel.toString());
        const levelChar = (this.levelIndicatorFlag >= 5) ? "-" : "+";
        this.levelIndicator.setText(levelChar.repeat(1 + env.startLevel / 10));
        this.levelIndicatorFlag = (this.levelIndicatorFlag + 1) % 10;
        if (nextScene != '') {
            this.kb.stopCapture();
            this.scene.start(nextScene);
        }
    }
}

/**********************************************************************/
// Scene for the ranking screen
class RankScreen extends Phaser.Scene {
    constructor( ...args ) {
        super({ key: 'rank', ...args })
    }
    preload() {
        this.defaultFont = { fontFamily: '"Share Tech Mono"', color: "#000", fontSize: "36px" };
        this.load.setBaseURL(env.baseURL);
        this.load.image('top7', 'img/top7.png');
    }

    create() {
        this.add.image(400, 120, 'top7');
        this.add.text(156, 240, '#        SCORE  LV   BLOCK', this.defaultFont);
        this.flashRow = [];
        this.flashTime = 0;
        for (let i = 0; i < 7; i++) {
            let row = [
                this.add.text(156, 280 + i * 40, (i + 1).toString(), this.defaultFont),
                this.add.text(429, 280 + i * 40, env.highScore[i].toLocaleString('ja-JP'), this.defaultFont).setOrigin(1, 0),
                this.add.text(505, 280 + i * 40, env.highLevel[i].toString(), this.defaultFont).setOrigin(1, 0),
                this.add.text(667, 280 + i * 40, env.highErase[i].toLocaleString('ja-JP'), this.defaultFont).setOrigin(1, 0)];
            if (env.lastRank == i)
                this.flashRow = row;
        }
        this.add.text(234, 560, "[[Press J key]]", this.defaultFont);
        this.kb = new GameKeyManager(this.input.keyboard);
    }

    update() {
        this.kb.updateKeys();
        this.kb.updateAcc();
        if (this.kb.accRotL == 1) {
            env.lastRank = -1;
            this.kb.stopCapture();
            this.scene.start('title');
        }
        this.flashTime = (this.flashTime == 0) ? 51 : this.flashTime - 1;
        for (let i = 0; i < this.flashRow.length; i++)
            this.flashRow[i].setColor(env.rgb(this.flashTime * 5, 0, this.flashTime));
    }
}


/**********************************************************************/
// Scene for the help screen
class HelpScreen extends Phaser.Scene {
    constructor( ...args ) {
        super({ key: 'help', ...args })
    }
    
    create() {
        this.defaultFont = { fontFamily: '"Share Tech Mono"', color: "#000", fontSize: "36px" };
        this.defaultFont.color = "#40f";
        this.add.text(  0,   0, "dalaigon", this.defaultFont);
        this.defaultFont.color = "#000";
        this.add.text(176,   0, "is a falling-block puzzle game.", this.defaultFont);
        this.add.text(  0,  40, "Press A/D to move blocks left/right, K/J", this.defaultFont);
        this.add.text(  0,  80, "to rotate them, and S to drop them.     ", this.defaultFont);
        this.add.text(  0, 160, "When 3 or more blocks of the same kind  ", this.defaultFont);
        this.add.text(  0, 200, "are connected horizontally, vertically, ", this.defaultFont);
        this.add.text(  0, 240, "or diagonally, they will disappear.     ", this.defaultFont);
        this.add.text(  0, 320, "To earn more points, keep the ", this.defaultFont);
        this.defaultFont.color = "#f04";
        this.add.text(585, 320, "dalaigon", this.defaultFont);
        this.add.text(  0, 360, "score multiplier ", this.defaultFont);
        this.defaultFont.color = "#000";
        this.add.text(332, 360, "higher. It's increased ", this.defaultFont);
        this.add.text(  0, 400, "when the block is erased diagonally (up ", this.defaultFont);
        this.add.text(  0, 440, "to x20), but decreased when erased", this.defaultFont);
        this.add.text(  0, 480, "horizontally or vertically.", this.defaultFont);
        this.add.text(234, 560, "[[Press J key]]", this.defaultFont);
        this.kb = new GameKeyManager(this.input.keyboard);
    }

    update() {
        this.kb.updateKeys();
        this.kb.updateAcc();
        if (this.kb.accRotL == 1) {
            this.kb.stopCapture();
            this.scene.start('title');
        }
    }
}


/**********************************************************************/
// Scene for the main game screen
class GameScreen extends Phaser.Scene {
    constructor( ...args ) {
        super({ key: 'game', ...args })
    }

    preload() {
        this.defaultFont = { fontFamily: '"Share Tech Mono"', color: "#000", fontSize: "36px" };
        this.load.setBaseURL(env.baseURL);
        this.load.image('blocks', 'img/blocks.png');
        this.load.image('wall', 'img/wall.png');
        this.load.spritesheet('block', 'img/blocks.png',
            { frameWidth: env.blockWidth, frameHeight: env.blockHeight });
    }
    
    create() {
        const wallPerBlockX = env.blockWidth / env.wallWidth;
        const wallPerBlockY = env.blockHeight / env.wallHeight;

        // game field
        const map = this.add.tilemap(null, env.blockWidth, env.blockHeight, env.WIDTH, env.HEIGHT);
        const tiles = map.addTilesetImage('blocks');
        const fieldInternal = map.createBlankLayer('layer1', tiles, env.fieldLeft, env.fieldTop);
        fieldInternal.fill(8);
        fieldInternal.fill(0, env.LEFT, 0, env.RIGHT - env.LEFT + 1, env.BOTTOM + 1);
        this.field = new GameFieldManager(fieldInternal);
        this.eraseFlag = new Array(env.WIDTH);
        for (let i = 0; i < env.WIDTH; i++)
            this.eraseFlag[i] = new Array(env.HEIGHT).fill(false);
        const upper = this.add.graphics();
        upper.fillStyle(0xffffff, 1);
        upper.fillRect(env.fieldLeft, env.fieldTop, env.WIDTH * env.blockWidth, env.TOP * env.blockHeight).setDepth(1);

        // walls
        for (let i = env.LEFT * wallPerBlockX - 1; i < (env.RIGHT + 1) * wallPerBlockX + 1; i++) {
            this.add.image(env.fieldLeft + (i + 0.5) * env.wallWidth,
                           env.fieldTop + env.TOP * env.blockHeight - env.wallHeight / 2, 'wall').setDepth(1);
            this.add.image(env.fieldLeft + (i + 0.5) * env.wallWidth,
                           env.fieldTop + (env.BOTTOM + 1) * env.blockHeight + env.wallHeight / 2, 'wall').setDepth(1);
        }
        for (let i = env.TOP * wallPerBlockY; i < (env.BOTTOM + 1) * wallPerBlockY; i++) {
            this.add.image(env.fieldLeft + env.LEFT * env.blockWidth - env.wallWidth / 2,
                           env.fieldTop + (i + 0.5) * env.wallHeight, 'wall').setDepth(1);
            this.add.image(env.fieldLeft + (env.RIGHT + 1) * env.blockWidth + env.wallWidth / 2,
                           env.fieldTop + (i + 0.5) * env.wallHeight, 'wall').setDepth(1);
        }

        // usage, score, etc.
        this.add.text(634,  20, "NEXT", this.defaultFont);
        this.nextBlock = [
            this.add.image(614 - env.blockWidth / 2, 60 + env.blockHeight / 2, 'block', 1).setDepth(1),
            this.add.image(614 - env.blockWidth / 2, 60 - env.blockHeight / 2, 'block', 1).setDepth(1),
            this.add.image(614 + env.blockWidth / 2, 60 + env.blockHeight / 2, 'block', 1).setDepth(1)];
        this.add.text(556, 120, "A/D: move", this.defaultFont);
        this.add.text(556, 160, "J/K: rotate", this.defaultFont);
        this.add.text(595, 200, "S: drop", this.defaultFont);
        this.add.text(536, 280, "High-Score:", this.defaultFont);
        this.add.text(536, 360, "Score:", this.defaultFont);
        this.add.text(536, 500, "Level:", this.defaultFont);
        this.add.text(536, 540, "Erase:", this.defaultFont);
        this.topText  = this.add.text(790, 320, env.highScore[0].toLocaleString('ja-JP'), this.defaultFont).setOrigin(1, 0);
        this.scoreText = this.add.text(790, 400, "0", this.defaultFont).setOrigin(1, 0);
        this.dalaiText = this.add.text(790, 440, "dalaigon x 1", this.defaultFont).setOrigin(1, 0);
        this.levelText = this.add.text(790, 500, env.startLevel.toString(), this.defaultFont).setOrigin(1, 0);
        this.eraseText = this.add.text(790, 540, "0", this.defaultFont).setOrigin(1, 0);
        let c = env.fieldLeft + (env.LEFT + env.RIGHT + 1) * env.blockWidth / 2;
        this.messageText = this.add.text(c, 200, "", this.defaultFont).setOrigin(0.5, 0);
        this.currentBlock = [
            this.add.image(0, 0, 'block', 0),
            this.add.image(0, 0, 'block', 0),
            this.add.image(0, 0, 'block', 0)];
        this.player = new GamePlayer(env.startLevel, env.highScore[0]);
        this.player.setNextBlock();
        this.player.updateNextBlock(this.nextBlock);
        this.kb = new GameKeyManager(this.input.keyboard);
        this.state = 'start';
        this.stateTimer = 150;
        this.frameTimer = 0;
        this.initScoreDisplay();
    }

    // drop floating blocks, returns whether there is at least one floating block
    dropField() {
        let ret = false;
        for (let i = env.LEFT; i <= env.RIGHT; i++) {
            let j = env.BOTTOM;
            for (; j >= 0 && this.field.get(i, j) != 0; j--) {}
            for (; j >= 0 && this.field.get(i, j) == 0; j--) {}
            if (j < 0)
                continue;
            ret = true;
            for (; j >= 0; j--)
                this.field.put(this.field.get(i, j), i, j + 1);
            this.field.put(0, i, 0);
        }
        return ret;
    }

    // check there are blocks to be erased in a line, returns increase of base score
    checkLine(lines, x, y, dx, dy) {
        let checkStack = [];
        let base = 0;
        let count = 0;
        let lastColor = -1;
        let c = this.field.get(x, y);

        // go forward and count the blocks until hitting the wall
        while (c != 8) {
            count = (c != 0 && c == lastColor) ? count + 1 : 1;
            checkStack.push(count);
            lastColor = c;
            x += dx;
            y += dy;
            c = this.field.get(x, y);
        }
        let erasable = false;

        // go back and check if the count became 3 or more
        while (checkStack.length > 0) {
            x -= dx;
            y -= dy;
            let len = checkStack.pop();
            if (! erasable && len >= 3) {
                erasable = true;
                base += env.lengthBase[Math.min(6, len - 3)];
                lines.push(this.createEraseEffect(x, y, dx, dy, len));
            }
            if (erasable)
                this.eraseFlag[x][y] = true;
            if (len == 1)
                erasable = false;
        }
        return base;
    }

    // mark blocks to be erased in the field, returns whether blocks are marked
    checkErase() {
        let diagLines = [];
        let hvLines = [];
        let base = 0;
        for (let i = env.LEFT; i <= env.RIGHT; i++)
            base += this.checkLine(hvLines, i, env.TOP, 0, 1);
        for (let i = env.TOP; i <= env.BOTTOM; i++)
            base += this.checkLine(hvLines, env.LEFT, i, 1, 0);
        for (let i = env.LEFT; i <= env.RIGHT; i++) {
            base += this.checkLine(diagLines, i, env.TOP, 1, 1);
            base += this.checkLine(diagLines, i, env.TOP, -1, 1);
        }
        for (let i = env.TOP + 1; i <= env.BOTTOM; i++) {
            base += this.checkLine(diagLines, env.LEFT, i, 1, 1);
            base += this.checkLine(diagLines, env.RIGHT, i, -1, 1);            
        }

        if (base == 0)
            return false;
        
        this.eraseEffects = diagLines.concat(hvLines);
        this.player.diagMulti += diagLines.length - hvLines.length;
        this.player.diagMulti = Math.max(0, Math.min(9, this.player.diagMulti));
        for (let i = env.LEFT; i <= env.RIGHT; i++) {
            for (let j = env.TOP; j <= env.BOTTOM; j++) {
                if (this.eraseFlag[i][j]) {
                    this.field.put(7, i, j);
                    this.player.erase++;
                }
            }
        }
        base *= env.chainMulti[this.player.chain];
        base *= this.player.level + 10;
        base *= diagLines.length + hvLines.length;
        this.player.increaseScore(base);

        this.player.erase = Math.min(999999, this.player.erase);
        this.player.level = Math.min(99, Math.floor(this.player.erase / 16) + this.player.startLevel);
        this.player.chain = Math.min(20, this.player.chain + 1);
        this.player.calcSpeed();
        this.dalaiText.setText(base.toLocaleString('ja-JP') + ' x ' +
            env.diagTable[this.player.diagMulti].toString());
        return true;
    }

    // erase the marked blocks
    eraseField() {
        for (let i = env.LEFT; i <= env.RIGHT; i++) {
            for (let j = env.TOP; j <= env.BOTTOM; j++) {
                if (this.eraseFlag[i][j]) {
                    this.field.put(0, i, j);
                    this.eraseFlag[i][j] = 0;
                }
            }
        }
        this.dalaiText.setText(this.player.increasedScore.toLocaleString('ja-JP'));
    }

    // create a line effect for the erasing blocks
    createEraseEffect(x, y, dx, dy, len) {
        let x1 = env.fieldLeft + (x - dx * (len - 1) + 0.5) * env.blockWidth;
        let y1 = env.fieldTop  + (y - dy * (len - 1) + 0.5) * env.blockHeight;
        let x2 = dx * (len - 1) * env.blockWidth / 8;
        let y2 = dy * (len - 1) * env.blockHeight / 8;
        let c = (dx != 0 && dy != 0) ? 0xc06000 : 0x0060c0;
        let l = this.add.line(x1, y1, 0, 0, x2, y2).setOrigin(0, 0).setStrokeStyle(2, c, 1);
        this.tweens.chain({
            targets: l,
            tweens: [
                { scale: 8, ease: 'power2', duration: 150 },
                { alpha: 0, duration: 350}]});
        return l;
    }

    // display messages before the start of the game
    setReadyText() {
        let m = (this.stateTimer > 100) ? "READY" :
                (this.stateTimer >  50) ? " SET " :
                (this.stateTimer >   0) ? " GO! " : "";
        let c = 255 - ((this.stateTimer - 1) % 50) * 5;
        this.messageText.setText(m);
        this.messageText.setColor(env.rgb(c, c, 255));
    }

    // check the timer, returns the number of frames to proceed
    updateTimer(delta) {
        this.frameTimer += delta;
        let frames = Math.floor(this.frameTimer * 60 / 1000);
        if (frames >= 5) {
            frames = 5;
            this.frameTimer = 0;
        } else {
            this.frameTimer -= frames * 1000 / 60;
        }
        return frames;
    }

    // initialize the texts of score etc.
    initScoreDisplay() {
        this.lastScoreInfo = {'score': 0, 'top': this.player.topScore, 'erase': 0, 'level': this.player.startLevel};
        this.scoreInfoTimer = {'score': 0, 'top': 0, 'erase': 0, 'level': 0};
    }

    // display one of the texts of score etc.
    updateScoreRow(text, key, cur) {
        if (this.lastScoreInfo[key] != cur) {
            text.setText(cur.toLocaleString('ja-JP'));
            text.setColor(env.rgb(96, 0, 255));
            this.lastScoreInfo[key] = cur;
            this.scoreInfoTimer[key] = 32;
        } else if (this.scoreInfoTimer[key] != 0) {
            this.scoreInfoTimer[key]--;
            let c = this.scoreInfoTimer[key];
            text.setColor(env.rgb(c * 3, 0, c * 8));
        }
    }

    // display the texts of score etc.
    updateScoreDisplay() {
        this.updateScoreRow(this.topText, 'top', this.player.topScore);
        this.updateScoreRow(this.scoreText, 'score', this.player.score);
        this.updateScoreRow(this.levelText, 'level', this.player.level);
        this.updateScoreRow(this.eraseText, 'erase', this.player.erase);
    }

    // display the dalaigon multiplier text
    updateDalaiDisplay() {
        this.dalaiText.setText('dalaigon x ' + env.diagTable[this.player.diagMulti].toString());
    }

    update(time, delta) {
        let frames = this.updateTimer(delta);
        this.kb.updateKeys();

        // state transition
        for (let f = frames; f >= 1; f--) {
            let nextState = this.state;
            let nextTimer = Math.max(0, this.stateTimer - 1);
            this.kb.updateAcc();
            if (this.state == 'start') {           // before the game
                this.setReadyText();
                if (this.stateTimer == 0) {
                    nextState = 'spawn';
                    nextTimer = 0;
                }
            } else if (this.state == 'main') {     // block is falling
                this.player.blockLastRotate = this.player.blockRotate;
                if (this.kb.accRotL == 1)
                    this.player.rotateCurrentBlock(this.field, 3);
                if (this.kb.accRotR == 1)
                    this.player.rotateCurrentBlock(this.field, 1);
                if (this.kb.accLeft == 1 || (this.kb.accLeft > 8 && this.kb.accLeft % 2 == 0))
                    this.player.moveCurrentBlock(this.field, -1);
                if (this.kb.accRight == 1 || (this.kb.accRight > 8 && this.kb.accRight % 2 == 0))
                    this.player.moveCurrentBlock(this.field, 1);
                this.player.fallCurrentBlock(this.field);
                if (this.kb.drop)
                    this.player.dropCurrentBlock(this.field);
                if (this.player.lockTime >= this.player.lockMax) {
                    this.player.blockLastRotate = this.player.blockRotate;
                    nextState = 'lock';
                    nextTimer = 5;
                }
                this.player.updateCurrentBlock(this.currentBlock);
            } else if (this.state == 'lock') {     // block is locking
                if (this.stateTimer == 5) {
                    for (let i = 0; i < 3; i++)
                        this.currentBlock[i].setTint(0xffff80);
                } else if (this.stateTimer == 2) {
                    for (let i = 0; i < 3; i++)
                        this.currentBlock[i].clearTint();
                } else if (this.stateTimer == 0) {
                    this.player.placeCurrentBlock(this.field);
                    this.player.updateCurrentBlock(this.currentBlock);
                    nextState = 'dropping';
                    nextTimer = 2;
                }
            } else if (this.state == 'dropping') { // there remains floating blocks
                if (this.stateTimer == 2) {
                    nextState = (this.dropField()) ? 'dropping' : 'dropped';
                } else if (this.stateTimer == 0) {
                    nextTimer = 2;
                }
            } else if (this.state == 'dropped') { // all floating blocks were dropped
                if (this.stateTimer == 0) {
                    if (this.checkErase()) {
                        nextState = 'erase';
                        nextTimer = 41;
                    } else {
                        nextState = 'spawn';
                        nextTimer = 17;
                    }
                }
            } else if (this.state == 'erase') {    // blocks in the field are erased
                if (this.stateTimer == 15) {
                    this.eraseField();
                } else if (this.stateTimer == 0) {
                    for (let i = 0; i < this.eraseEffects.length; i++)
                        this.eraseEffects[i].destroy();
                    nextState = 'dropping';
                    nextTimer = 2;
                }
            } else if (this.state == 'spawn') {    // waiting for the next block
                if (this.stateTimer == 0) {
                    let rot = (this.kb.accRotL != 0) ? 3 : (this.kb.accRotR != 0) ? 1 : 0;
                    let ok = this.player.generateCurrentBlock(this.field, rot);
                    this.player.updateNextBlock(this.nextBlock);
                    this.player.updateCurrentBlock(this.currentBlock);
                    this.updateDalaiDisplay();
                    if (ok) {
                        nextState = 'main';
                    } else {
                        this.player.placeCurrentBlock(this.field);
                        this.player.updateCurrentBlock(this.currentBlock);
                        nextState = 'over1';
                        nextTimer = env.BOTTOM * 3 + 2;
                    }
                }
            } else if (this.state == 'over1') {    // game over: gray out the blocks
                if (this.stateTimer % 3 == 2) {
                    let y = env.BOTTOM - Math.floor(this.stateTimer / 3);
                    for (let x = env.LEFT; x <= env.RIGHT; x++)
                        this.field.put((this.field.get(x, y) != 0) ? 6 : 0, x, y);
                } else if (this.stateTimer == 0) {
                    nextState = 'over2';
                    nextTimer = env.BOTTOM * 4 + 3;
                }
            } else if (this.state == 'over2') {    // game over: fall the blocks out
                if (this.stateTimer % 4 == 3) {
                    for (let x = env.LEFT; x <= env.RIGHT; x++)
                        this.field.put(0, x, env.BOTTOM);
                    this.dropField();
                } else if (this.stateTimer == 0) {
                    this.messageText.setText("GAME OVER!");
                    this.messageText.setColor("#000000");
                    this.messageText.y = 600;
                    nextState = 'over3';
                    nextTimer = 40;
                }
            } else if (this.state == 'over3') {    // game over: display message
                this.messageText.y = 200 + this.stateTimer * 10;
                if (this.stateTimer == 0 && this.kb.accRotL == 1) {
                    env.updateRank(this.player);
                    this.kb.stopCapture();
                    this.scene.start('rank');
                }
            }
            this.updateScoreDisplay();
            this.state = nextState;
            this.stateTimer = nextTimer;
        }
    }
}

/**********************************************************************/
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#fff',
    parent: 'game-container',
    scene: [TitleScreen, GameScreen, RankScreen, HelpScreen],
    fps: {
        target: 60
    }
};

/**********************************************************************/