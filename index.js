import cheerio from 'cheerio';
import fetch from 'node-fetch';
import TelegramBot from 'node-telegram-bot-api';

// Replace with your Telegram bot token
const token = '7317674653:AAFi0vIpuX6W3XLt7Mvz6di31Smkq0JgeX0';
const bot = new TelegramBot(token, { polling: true });

// URL of the NSU course list page
const url = 'https://rds2.northsouth.edu/index.php/common/showofferedcourses';

// Your chat ID
let chatId = null;

// Maintain a watchlist of monitored courses and sections
let watchlist = [];

// Function to scrape the website with retry logic
async function scrapeWebsiteWithRetry() {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const response = await fetch(url, { timeout: 15000 }); // Adjust timeout as needed
            const body = await response.text();
            const $ = cheerio.load(body);

            let courses = [];

            // Adjust the selector based on the provided HTML structure
            $('#offeredCourseTbl tbody tr').each((index, element) => {
                const courseName = $(element).find('td').eq(1).text().trim();
                const section = $(element).find('td').eq(2).text().trim();
                const availableSeats = $(element).find('td').eq(6).text().trim();

                courses.push({ courseName, section, availableSeats });
            });

            return courses;

        } catch (error) {
            retries++;
            console.error(`Error fetching data (attempt ${retries}/${maxRetries}): ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        }
    }

    throw new Error(`Failed to fetch data after ${maxRetries} attempts.`);
}

// Function to send message based on seat availability
async function sendMessageBasedOnAvailability(desiredCourse, desiredSection, availableSeats) {
    chatId = chatId; // Update chatId if necessary

    if (parseInt(availableSeats) > 0) {
        bot.sendMessage(chatId, `Seats available in ${desiredCourse} section ${desiredSection}`);
    }
}

// Listen for messages to manage watchlist
bot.on('message', async (msg) => {
    chatId = msg.chat.id;
    const text = msg.text.toUpperCase(); // Convert text to uppercase
    // console.log(text);
    if (text.startsWith('+')) {
        // Add to watchlist command, e.g., +ACT320 1
        const [, inputCourseAndSection] = text.split('+');
        const [inputCourse, inputSection] = inputCourseAndSection.split('.');
        console.log(inputSection);
        if (inputCourse && inputSection) {
            watchlist.push({ courseName: inputCourse, section: inputSection });
            bot.sendMessage(chatId, `Added ${inputCourse} section ${inputSection} to watchlist.`);
        } else {
            bot.sendMessage(chatId, `Invalid format. Please use +CourseName SectionNumber.`);
        }

    } else if (text.startsWith('-')) {
        // Remove from watchlist command, e.g., -ACT320 1
        const [, inputCourseAndSection] = text.split('-');
        const [inputCourse, inputSection] = inputCourseAndSection.split('.');
        if (inputCourse && inputSection) {
            watchlist = watchlist.filter(item =>
                !(item.courseName === inputCourse && item.section === inputSection)
            );
            bot.sendMessage(chatId, `Removed ${inputCourse} section ${inputSection} from watchlist.`);
        } else {
            bot.sendMessage(chatId, `Invalid format. Please use -CourseName SectionNumber.`);
        }

    } else if (text === '/LIST') {
        // List watchlist command
        if (watchlist.length > 0) {
            const watchlistMessage = watchlist.map(item =>
                `${item.courseName} section ${item.section}`
            ).join('\n');
            bot.sendMessage(chatId, `Current watchlist:\n${watchlistMessage}`);
        } else {
            bot.sendMessage(chatId, `Watchlist is empty.`);
        }

    } else {
        bot.sendMessage(chatId, `Invalid command.`);
    }
});

// Set an interval to check seat availability every 3 minutes (180000 milliseconds)
setInterval(async () => {
    if (chatId) {
        try {
            const courses = await scrapeWebsiteWithRetry();

            for (const item of watchlist) {
                const matchedCourse = courses.find(course =>
                    course.courseName === item.courseName && course.section === item.section
                );

                if (matchedCourse && parseInt(matchedCourse.availableSeats) > 0) {
                    await sendMessageBasedOnAvailability(item.courseName, item.section, matchedCourse.availableSeats);
                }
            }
        } catch (err) {
            console.error(`Error checking seat availability: ${err.message}`);
        }
    }
}, 180000); // Interval set to 3 minutes (180000 milliseconds)