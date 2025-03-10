const config = require('./config.json')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const fs = require('fs')

const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    //auth: 'microsoft'
})

bot.loadPlugin(pathfinder)

let shulkerPositions = []
let emptyShulkerCount = 0
let shulkerID
function placeShulkers() {
    bot.pathfinder.setGoal(new goals.GoalNear(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z, 2))

    bot.once('goal_reached', async () => {
        try {
            const shulkerChestContainer = await bot.openContainer(bot.blockAt(new Vec3(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z)))                
            for (let slot of shulkerChestContainer.slots) {
                if (slot) {
                    try {
                        await shulkerChestContainer.withdraw(slot.type, null, slot.count)
                        emptyShulkerCount += 1

                        await sleep(150)

                        shulkerID = slot.type
                    } catch (error) {
                        console.log(`Failed to withdraw item: ${error.message}`)
                    }
                }
            }
            shulkerChestContainer.close()

            const positions = bot.findBlocks({
                matching: block => block.name === config.shulkerBlock,
                maxDistance: config.searchRange,
                count: emptyShulkerCount
            })

            if (positions.count === 0) {
                bot.chat('Could not find anywhere to place shulkers.')
            }

            let placedShulkers = 0
            for (const pos of positions) {
                const placePosition = bot.blockAt(pos).position.offset(0, 1, 0)

                if (bot.blockAt(placePosition).boundingBox !== 'empty') {
                    console.log(`Skipping ${placePosition} - Block already exists.`)
                    continue
                }
                
                await bot.pathfinder.goto(new goals.GoalNear(placePosition.x, placePosition.y + 1, placePosition.z, 2))

                shulkerPositions.push({x: placePosition.x, y: placePosition.y, z: placePosition.z})

                try {
                    const blockToPlace = bot.inventory.items().find(item => item.name === 'shulker_box')
                    if (!blockToPlace) {
                        bot.chat('No shulkers in inventory.')
                        return
                    }

                    await bot.equip(blockToPlace, 'hand')
                    await bot.placeBlock(bot.blockAt(pos), { x: 0, y: 1, z: 0})
                    placedShulkers += 1

                } catch (err) {
                    console.log(`Failed to place block at ${placePosition}: ${err.message}`)
                }
            }
            bot.chat(`Placed ${placedShulkers} shulkers.`)

        } catch (error) {
            console.log("An error occured: " + error.message)
            console.error(error)
        }
    })
}

let itemType
let itemCount = 0
function fillShulkers() {
    bot.pathfinder.setGoal(new goals.GoalNear(config.itemShulker.x, config.itemShulker.y, config.itemShulker.z, 2))
        
    bot.once('goal_reached', async () => {
        try {
            const itemContainer = await bot.openContainer(bot.blockAt(new Vec3(config.itemShulker.x, config.itemShulker.y, config.itemShulker.z)))

            let itemsWithdrawn = 0
            for (let slot of itemContainer.slots) {
                if (slot && itemsWithdrawn < emptyShulkerCount) {
                    try {
                        await itemContainer.withdraw(slot.type, null, slot.count)

                        itemType = slot.type
                        itemCount = slot.count

                        itemsWithdrawn += 1
                        if (itemsWithdrawn >= emptyShulkerCount) {
                            break
                        }
                        await sleep(150)
                    } catch (error) {
                        console.log(`Failed to withdraw item: ${error.message}`)
                    }
                }
            }
            await itemContainer.close()

            let fillCount = 0
            for (const pos of shulkerPositions) {

                bot.pathfinder.setGoal(new goals.GoalBlock(pos.x, pos.y + 1, pos.z))

                try {
                    const kitContainer = await bot.openContainer(bot.blockAt(new Vec3(pos.x, pos.y, pos.z)))    
                    await kitContainer.deposit(itemType, null, itemCount, null)
                    fillCount += 1

                    await kitContainer.close()

                    await sleep(100)
                } catch (error) {
                    console.log('Could not place an item in the shulker.')
                }
            }

            bot.chat(`Filled ${fillCount} shulkers with ${itemCount} items each.`)

        } catch (error) {
            console.log("An error occured: " + error.message)
            console.error(error)
        }
    })
}

let brokenShulkers = 0
async function breakShulkers() {
    for (const pos of shulkerPositions) {
        bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z))
        try {
            const breakTool = bot.inventory.items().find(item => item.name === 'diamond_pickaxe' || item.name === 'netherite_pickaxe')
            if (breakTool) {
                bot.equip(breakTool, 'hand')
            }

            await bot.dig(bot.blockAt(new Vec3(pos.x, pos.y, pos.z)))
            brokenShulkers += 1
        } catch (error) {
            console.log(`Failed to break shulker: ${error}`)
        }
    }
    bot.chat(`Broke ${brokenShulkers} shulkers`)

    await sleep(500)

    const floatingItems = Object.values(bot.entities).filter(entity => entity.name && entity.displayName === 'Item')
    for (const item of floatingItems) {
        const {x, y, z} = item.position
        await bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
    }

    await bot.pathfinder.goto(new goals.GoalNear(config.kitChest.x, config.kitChest.y, config.kitChest.z, 2))
    try {
        const kitChestContainer = await bot.openContainer(bot.blockAt(new Vec3(config.kitChest.x, config.kitChest.y, config.kitChest.z)))
                
        while (brokenShulkers > 0) {
            kitChestContainer.deposit(shulkerID, null, 1)
            brokenShulkers -= 1
            await sleep(150)
        }
        kitChestContainer.close()

    } catch (error) {
        console.log(`Could not open chest: ${error}`)        
    }
}

bot.once('spawn', () => {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    bot.pathfinder.setMovements(defaultMove)
    bot.physics.yawSpeed = 5
})

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve,ms))
}
bot.on('chat', (username, message) => {
    if (message === 'placeShulkers') {
       placeShulkers() 
    } else if (message === 'fillShulkers') {
        fillShulkers()
    } else if (message === 'breakShulkers') {
        breakShulkers()
    }
})