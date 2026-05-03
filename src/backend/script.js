const express = require('express') 
const cors = require('cors') 

const PORT_NUMBER = 8000 

const app = express() 
app.use(express.json()) 
app.use(cors({origin: '*'})) 

app.listen(HTTP_PORT, () => {
    console.log(`Server running on port ${HTTP_PORT}`)
})
