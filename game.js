        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Game settings - WIDE FOV
        const FOV = Math.PI * 0.7; // ~126 degrees - very wide
        const HALF_FOV = FOV / 2;
        const MAX_DEPTH = 20;
        
        // Maze map (1 = wall, 0 = path)
        const MAP = [
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1],
            [1,0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,0,1,0,1],
            [1,0,1,0,1,1,0,1,1,0,1,1,1,1,1,1,0,1,0,1],
            [1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
            [1,1,1,1,0,1,1,1,1,1,1,1,1,1,0,1,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ];
        
        const MAP_HEIGHT = MAP.length;
        const MAP_WIDTH = MAP[0].length;
        
        // Player
        let player = {
            x: 1.5,
            y: 1.5,
            angle: 0,
            pitch: 0,
            verticalVelocity: 0,
            z: 0,
            stamina: 100,
            isSprinting: false,
            isOnGround: true
        };
        
        // Enemy - independent world entity with pathfinding
        let enemy = {
            x: 18.5,
            y: 9.5,
            speed: 0.035,
            baseSpeed: 0.035,
            path: [],
            pathUpdateTimer: 0
        };
        
        // Controls
        const keys = {};
        let mouseLocked = false;
        let gameStarted = false;
        let gameOver = false;
        let startTime = 0;
        let gunBob = 0;
        
        // Depth buffer for sprite occlusion
        let depthBuffer = [];
        
        // BFS Pathfinding
        function findPath(startX, startY, endX, endY) {
            const startMapX = Math.floor(startX);
            const startMapY = Math.floor(startY);
            const endMapX = Math.floor(endX);
            const endMapY = Math.floor(endY);
            
            if (startMapX === endMapX && startMapY === endMapY) {
                return [{x: endX, y: endY}];
            }
            
            const queue = [[startMapX, startMapY]];
            const visited = new Set();
            const parent = new Map();
            
            visited.add(`${startMapX},${startMapY}`);
            
            const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
            
            while (queue.length > 0) {
                const [cx, cy] = queue.shift();
                
                if (cx === endMapX && cy === endMapY) {
                    // Reconstruct path
                    const path = [];
                    let current = `${endMapX},${endMapY}`;
                    
                    while (current) {
                        const [px, py] = current.split(',').map(Number);
                        path.unshift({x: px + 0.5, y: py + 0.5});
                        current = parent.get(current);
                    }
                    
                    // Add final destination
                    path.push({x: endX, y: endY});
                    return path;
                }
                
                for (const [dx, dy] of directions) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    const key = `${nx},${ny}`;
                    
                    if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
                        MAP[ny][nx] === 0 && !visited.has(key)) {
                        visited.add(key);
                        parent.set(key, `${cx},${cy}`);
                        queue.push([nx, ny]);
                    }
                }
            }
            
            return []; // No path found
        }
        
        // Event listeners
        document.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            if (e.code === 'Space') e.preventDefault();
        });
        
        document.addEventListener('keyup', (e) => {
            keys[e.code] = false;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (mouseLocked && gameStarted && !gameOver) {
                player.angle += e.movementX * 0.002;
                player.pitch -= e.movementY * 0.002;
                player.pitch = Math.max(-0.8, Math.min(0.8, player.pitch));
            }
        });
        
        canvas.addEventListener('click', () => {
            if (gameStarted && !gameOver) {
                canvas.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            mouseLocked = document.pointerLockElement === canvas;
        });
        
        function startGame() {
            document.getElementById('startScreen').style.display = 'none';
            gameStarted = true;
            startTime = Date.now();
            enemy.path = findPath(enemy.x, enemy.y, player.x, player.y);
            canvas.requestPointerLock();
            requestAnimationFrame(gameLoop);
        }
        
        function restartGame() {
            player = {
                x: 1.5,
                y: 1.5,
                angle: 0,
                pitch: 0,
                verticalVelocity: 0,
                z: 0,
                stamina: 100,
                isSprinting: false,
                isOnGround: true
            };
            enemy = {
                x: 18.5,
                y: 9.5,
                speed: 0.035,
                baseSpeed: 0.035,
                path: [],
                pathUpdateTimer: 0
            };
            gameOver = false;
            startTime = Date.now();
            enemy.path = findPath(enemy.x, enemy.y, player.x, player.y);
            document.getElementById('deathScreen').style.display = 'none';
            canvas.requestPointerLock();
        }
        
        function checkCollision(x, y, margin = 0.2) {
            return MAP[Math.floor(y - margin)]?.[Math.floor(x - margin)] === 1 ||
                   MAP[Math.floor(y + margin)]?.[Math.floor(x - margin)] === 1 ||
                   MAP[Math.floor(y - margin)]?.[Math.floor(x + margin)] === 1 ||
                   MAP[Math.floor(y + margin)]?.[Math.floor(x + margin)] === 1;
        }
        
        function updatePlayer() {
            const baseSpeed = 0.06;
            const sprintMultiplier = 1.8;
            
            player.isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];
            
            if (player.isSprinting && player.stamina > 0 && (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'])) {
                player.stamina -= 0.5;
            } else if (player.stamina < 100) {
                player.stamina += 0.2;
            }
            player.stamina = Math.max(0, Math.min(100, player.stamina));
            
            const currentSpeed = baseSpeed * (player.isSprinting && player.stamina > 0 ? sprintMultiplier : 1);
            
            let moveX = 0;
            let moveY = 0;
            
            if (keys['KeyW']) {
                moveX += Math.cos(player.angle) * currentSpeed;
                moveY += Math.sin(player.angle) * currentSpeed;
            }
            if (keys['KeyS']) {
                moveX -= Math.cos(player.angle) * currentSpeed * 0.7;
                moveY -= Math.sin(player.angle) * currentSpeed * 0.7;
            }
            if (keys['KeyA']) {
                moveX += Math.cos(player.angle - Math.PI/2) * currentSpeed * 0.8;
                moveY += Math.sin(player.angle - Math.PI/2) * currentSpeed * 0.8;
            }
            if (keys['KeyD']) {
                moveX += Math.cos(player.angle + Math.PI/2) * currentSpeed * 0.8;
                moveY += Math.sin(player.angle + Math.PI/2) * currentSpeed * 0.8;
            }
            
            if (!checkCollision(player.x + moveX, player.y)) player.x += moveX;
            if (!checkCollision(player.x, player.y + moveY)) player.y += moveY;
            
            // Jumping
            if (keys['Space'] && player.isOnGround) {
                player.verticalVelocity = 0.15;
                player.isOnGround = false;
            }
            
            player.z += player.verticalVelocity;
            player.verticalVelocity -= 0.008;
            
            if (player.z <= 0) {
                player.z = 0;
                player.isOnGround = true;
                player.verticalVelocity = 0;
            }
            
            // Gun bobbing
            if (moveX !== 0 || moveY !== 0) {
                gunBob += 0.15 * (player.isSprinting ? 1.5 : 1);
            }
            
            document.getElementById('staminaBar').style.width = player.stamina + '%';
        }
        
        // Enemy AI with BFS pathfinding
        function updateEnemy() {
            // Update path periodically
            enemy.pathUpdateTimer++;
            if (enemy.pathUpdateTimer > 30) { // Update path every 30 frames
                enemy.pathUpdateTimer = 0;
                enemy.path = findPath(enemy.x, enemy.y, player.x, player.y);
            }
            
            // Speed increases over time
            const timePassed = (Date.now() - startTime) / 1000;
            enemy.speed = enemy.baseSpeed + (timePassed * 0.002);
            
            // Follow path
            if (enemy.path.length > 0) {
                const target = enemy.path[0];
                const dx = target.x - enemy.x;
                const dy = target.y - enemy.y;
                const distToWaypoint = Math.sqrt(dx * dx + dy * dy);
                
                if (distToWaypoint < 0.3) {
                    // Reached waypoint, move to next
                    enemy.path.shift();
                } else {
                    // Move toward waypoint
                    const moveAngle = Math.atan2(dy, dx);
                    enemy.x += Math.cos(moveAngle) * enemy.speed;
                    enemy.y += Math.sin(moveAngle) * enemy.speed;
                }
            }
            
            // Check distance to player
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Check if caught player
            if (dist < 0.6) {
                gameOver = true;
                document.getElementById('deathScreen').style.display = 'flex';
                document.getElementById('finalTime').textContent = Math.floor((Date.now() - startTime) / 1000);
                document.exitPointerLock();
            }
            
            // Warning when close
            const warning = document.getElementById('warning');
            if (dist < 5) {
                warning.style.opacity = (5 - dist) / 5;
            } else {
                warning.style.opacity = 0;
            }
            
            document.getElementById('distance').textContent = dist.toFixed(1);
        }
        
        // DDA Raycasting
        function castRay(angle) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            
            let mapX = Math.floor(player.x);
            let mapY = Math.floor(player.y);
            
            const deltaDistX = Math.abs(1 / cos);
            const deltaDistY = Math.abs(1 / sin);
            
            let stepX, stepY;
            let sideDistX, sideDistY;
            
            if (cos < 0) {
                stepX = -1;
                sideDistX = (player.x - mapX) * deltaDistX;
            } else {
                stepX = 1;
                sideDistX = (mapX + 1 - player.x) * deltaDistX;
            }
            
            if (sin < 0) {
                stepY = -1;
                sideDistY = (player.y - mapY) * deltaDistY;
            } else {
                stepY = 1;
                sideDistY = (mapY + 1 - player.y) * deltaDistY;
            }
            
            let hit = false;
            let side = 0;
            
            for (let i = 0; i < 50; i++) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += stepX;
                    side = 0;
                } else {
                    sideDistY += deltaDistY;
                    mapY += stepY;
                    side = 1;
                }
                
                if (mapX < 0 || mapX >= MAP_WIDTH || mapY < 0 || mapY >= MAP_HEIGHT) break;
                if (MAP[mapY][mapX] === 1) { hit = true; break; }
            }
            
            let perpWallDist;
            if (side === 0) {
                perpWallDist = (mapX - player.x + (1 - stepX) / 2) / cos;
            } else {
                perpWallDist = (mapY - player.y + (1 - stepY) / 2) / sin;
            }
            
            return { depth: Math.abs(perpWallDist), hit, side };
        }
        
        function render() {
            const pitchOffset = player.pitch * 200 + player.z * 100;
            
            // Clear and draw sky
            const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height / 2 + pitchOffset);
            skyGrad.addColorStop(0, '#0a0205');
            skyGrad.addColorStop(1, '#2a0808');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height / 2 + pitchOffset);
            
            // Floor
            const floorGrad = ctx.createLinearGradient(0, canvas.height / 2 + pitchOffset, 0, canvas.height);
            floorGrad.addColorStop(0, '#151515');
            floorGrad.addColorStop(1, '#050505');
            ctx.fillStyle = floorGrad;
            ctx.fillRect(0, canvas.height / 2 + pitchOffset, canvas.width, canvas.height);
            
            // Raycast walls
            const numRays = canvas.width;
            depthBuffer = [];
            
            for (let i = 0; i < numRays; i++) {
                const rayAngle = player.angle - HALF_FOV + (i / numRays) * FOV;
                const ray = castRay(rayAngle);
                depthBuffer.push(ray.depth);
                
                if (ray.hit) {
                    const correctedDist = ray.depth * Math.cos(rayAngle - player.angle);
                    const wallHeight = (canvas.height / correctedDist) * 0.8;
                    
                    const brightness = Math.max(0.1, 1 - correctedDist / MAX_DEPTH);
                    const shade = ray.side === 0 ? 1 : 0.7;
                    
                    const r = Math.floor(100 * brightness * shade);
                    const g = Math.floor(40 * brightness * shade);
                    const b = Math.floor(40 * brightness * shade);
                    
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    const wallTop = (canvas.height - wallHeight) / 2 + pitchOffset;
                    ctx.fillRect(i, wallTop, 1, wallHeight);
                }
            }
            
            // Render enemy as a sprite in world space
            renderEnemy(pitchOffset);
            
            // Draw gun
            drawGun();
            
            // Update UI
            document.getElementById('timer').textContent = Math.floor((Date.now() - startTime) / 1000);
        }
        
        function renderEnemy(pitchOffset) {
            // Calculate vector from player to enemy in world space
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 0.1 || dist > MAX_DEPTH) return;
            
            // Calculate angle to enemy in world space
            const angleToEnemy = Math.atan2(dy, dx);
            
            // Calculate relative angle (difference between where player is looking and where enemy is)
            let relativeAngle = angleToEnemy - player.angle;
            
            // Normalize to -PI to PI
            while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
            while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
            
            // Check if enemy is within FOV
            if (Math.abs(relativeAngle) > HALF_FOV + 0.3) return;
            
            // Calculate screen X position
            const screenX = canvas.width / 2 + (relativeAngle / HALF_FOV) * (canvas.width / 2);
            
            // Check depth buffer - is enemy behind a wall?
            const rayIndex = Math.floor(screenX);
            if (rayIndex < 0 || rayIndex >= depthBuffer.length) return;
            if (dist > depthBuffer[rayIndex]) return; // Behind wall
            
            // Calculate enemy size based on distance
            const enemyHeight = (canvas.height / dist) * 1.2;
            const enemyWidth = enemyHeight * 0.5;
            const enemyY = canvas.height / 2 - enemyHeight / 2 + pitchOffset;
            
            // Draw shadow
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(screenX, canvas.height / 2 + enemyHeight / 2 + pitchOffset, enemyWidth / 2, enemyHeight / 10, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw body - tall dark figure
            ctx.fillStyle = '#080808';
            ctx.fillRect(screenX - enemyWidth / 2, enemyY + enemyHeight * 0.3, enemyWidth, enemyHeight * 0.7);
            
            // Draw head
            const headRadius = enemyWidth * 0.4;
            const pulse = Math.sin(Date.now() / 80) * headRadius * 0.1;
            ctx.beginPath();
            ctx.arc(screenX, enemyY + enemyHeight * 0.25, headRadius + pulse, 0, Math.PI * 2);
            ctx.fillStyle = '#101010';
            ctx.fill();
            
            // Draw glowing eyes
            const eyeGlow = Math.abs(Math.sin(Date.now() / 150));
            const eyeSize = headRadius * 0.3;
            const eyeY = enemyY + enemyHeight * 0.22;
            const eyeSpacing = headRadius * 0.5;
            
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 15 + eyeGlow * 15;
            ctx.fillStyle = `rgb(255, ${Math.floor(50 + eyeGlow * 100)}, 0)`;
            
            ctx.beginPath();
            ctx.arc(screenX - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(screenX + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            
            // Draw creepy mouth
            ctx.strokeStyle = '#300';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, enemyY + enemyHeight * 0.35, headRadius * 0.4, 0.2 * Math.PI, 0.8 * Math.PI);
            ctx.stroke();
        }
        
        function drawGun() {
            const bobX = Math.sin(gunBob) * 8;
            const bobY = Math.abs(Math.cos(gunBob)) * 12;
            const gunX = canvas.width / 2 + 80 + bobX;
            const gunY = canvas.height - 200 + bobY;
            
            // Gun body
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(gunX, gunY + 60, 130, 65);
            ctx.fillRect(gunX + 30, gunY + 30, 70, 45);
            
            // Barrel
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(gunX + 40, gunY, 50, 45);
            ctx.fillRect(gunX + 45, gunY - 25, 40, 35);
            
            // Details
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(gunX + 55, gunY + 45, 35, 8);
            
            // Handle
            ctx.fillStyle = '#222';
            ctx.fillRect(gunX + 55, gunY + 125, 45, 65);
            
            // Muzzle
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(gunX + 65, gunY - 15, 16, 0, Math.PI * 2);
            ctx.fill();
        }
        
        function gameLoop(timestamp) {
            if (!gameStarted) return;
            
            if (!gameOver) {
                updatePlayer();
                updateEnemy();
            }
            
            render();
            
            // Vignette
            const vignette = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.height / 3,
                canvas.width / 2, canvas.height / 2, canvas.height
            );
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Fear effect when enemy is close
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 4) {
                ctx.fillStyle = `rgba(139, 0, 0, ${(4 - dist) / 8})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            requestAnimationFrame(gameLoop);
        }
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });