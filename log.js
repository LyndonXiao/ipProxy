const log = (...arguments) => {
    const d = new Date();
    console.log(`【${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}】`, arguments)
}

module.exports = log;