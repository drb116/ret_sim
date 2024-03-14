let ORIGINAL_BALANCE;
let SPEND;
let MIN_SPEND;
let BOND_YIELD;
let BOND_AMT;
let PIGGY_BANK_INIT;
let PIGGY_BANK_TARGET;
let COLA;
let SP_AMT;
let SPOUSE_SSN;
let SPOUSE_SSN_START;
let PENSION;
let PENSION_START;
let year_count;
const CURRENT_YEAR = 2024;
const STARTING_YEAR = 1970;
const SIM_YEARS = CURRENT_YEAR - STARTING_YEAR;
const DIV_RATE = 0.005;
const infile = "sp500.dat";
const portfolio = {};
const sp_data = {};
const spend = {};
const income = {};
const final_values = {};
const output = {};
const stats = {};
let plotValues = [{}, {}, {}, {}];
let plot;
let minGraph = 0;
let spend_incr = 20000;
let min_spend_incr = 20000;

for (let i = 0; i < CURRENT_YEAR - STARTING_YEAR; i++) {
    output[i + 1] = {};
}

let advancedInputs = document.querySelector('.advanced-inputs');
advancedInputs.style.display = "none";

function toggleAdvancedInputs() {
    let advancedInputs = document.querySelector('.advanced-inputs');
    if (advancedInputs.style.display == "none") {
        advancedInputs.style.display = "block";
    } 
    else {
        advancedInputs.style.display = "none";
    }
}

async function read_sp() {
    try {
        const response = await fetch(infile);
        const fileContent = await response.text();
        const lines = fileContent.split('\n');
        lines.forEach(line => {
            const mon = line.slice(0, 3);
            const year = parseInt(line.slice(3, 7));
            const value = parseFloat(line.slice(8));
            if (!sp_data[year]) {
                sp_data[year] = {};
            }
            sp_data[year][mon] = value;
        });
    } catch (error) {
        console.error("Error reading file:", error);
    }
}

function starting_value(sim_years) {
    const starting_year = CURRENT_YEAR - sim_years;
    const sp_start_value = sp_data[starting_year]["Jan"];
    sp_shares = SP_AMT / sp_start_value;
    portfolio["SP"] = sp_shares;
    portfolio["BOND"] = BOND_AMT;
}

function get_spend(sim_years) {
    const start_year = CURRENT_YEAR - sim_years;
    let annual_spend = SPEND;
    let annual_pension = 0;
    for (let year = start_year; year <= CURRENT_YEAR; year++) {

        if (year == start_year + PENSION_START) {
            annual_pension += PENSION;
        }
        if (year == start_year + SPOUSE_SSN_START) {
            annual_pension += SPOUSE_SSN;
        }
        spend[year] = annual_spend;
        income[year] = annual_pension;
        annual_spend *= (1 + COLA);
        annual_pension *= (1 + COLA);
    }
}

function lower(previous, current) {
    return previous[0] * 0.92 > current || previous[1] * 0.94 > current ||
           previous[2] * 0.95 > current || previous[3] * 0.95 > current;
}

function process(sim_years) {
    let counter = 0;
    let piggy_bank = PIGGY_BANK_INIT;
    let end_value = 0;
    const start_year = CURRENT_YEAR - sim_years;
    starting_value(sim_years);
    const prevs = [sp_data[start_year]["Jan"]];
    const previous_sp = Array(4).fill(prevs[0]);

    for (let year = start_year; year < CURRENT_YEAR; year++) {
        let quarterly_spend = spend[year] / 4;
        const quarterly_income = (portfolio["BOND"] * BOND_YIELD + income[year]) / 4;
        for (const mon of ["Jan", "Apr", "Jul", "Oct"]) {
            const sp_value = sp_data[year][mon];
            const sp_port_value = sp_value * portfolio["SP"];
            const this_quarterly_income = quarterly_income + sp_port_value * DIV_RATE / 4;
            if (lower(previous_sp, sp_value)) {
                const income_spread = (SPEND - MIN_SPEND) / 4;
                let reduction_perc = 15 * (Math.max(...previous_sp) - sp_value) / Math.max(...previous_sp);
                reduction_perc = Math.min(Math.max(reduction_perc, 0), 1);
                let reduction = income_spread * reduction_perc;
                quarterly_spend -= reduction;
            }
            let gap = quarterly_spend - this_quarterly_income;

            if (lower(previous_sp, sp_value) && piggy_bank > 0) {
                if (piggy_bank > gap) {
                    piggy_bank -= gap;
                    gap = 0;
                } else {
                    gap -= piggy_bank;
                    piggy_bank = 0;
                }
            } else if (previous_sp[3] * 1.03 < sp_value && piggy_bank < 2 * PIGGY_BANK_TARGET) {
                const diff_to_max = 2 * PIGGY_BANK_TARGET - piggy_bank;
                if (diff_to_max < 10000) {
                    piggy_bank += diff_to_max;
                    gap += diff_to_max;
                } else {
                    piggy_bank += 10000;
                    gap += 10000;
                }
            }
            previous_sp.shift();
            previous_sp.push(sp_value);
            const shares = gap / sp_value;
            portfolio["SP"] -= shares;
        }
        const sp_balance = portfolio["SP"] * sp_data[year + 1]["Jan"];
        end_value = Math.round(sp_balance + portfolio["BOND"]);
        const my_year = year - start_year + 1;
        output[my_year][start_year.toString()] = end_value;
        if (year === CURRENT_YEAR - 1) {
            final_values[start_year] = end_value;
            if (CURRENT_YEAR - 9 > start_year) {
                plotValues[plot]["" + SPEND].push(end_value);
            }
        }
    }
}

function run_year_sim() {
    for (let years = CURRENT_YEAR - STARTING_YEAR; years > 0; years--) {
        get_spend(years);
        process(years);
    }
}

function print_stats() {
    let num_fail_years = 0;
    let num_bad_years = 0;
    let num_good_years = 0;
    let num_great_years = 0;
    let num_runaway_years = 0;
    year_count = 0;
    let best_year = CURRENT_YEAR - 10;
    let worst_year = CURRENT_YEAR - 10;

    for (const year_key in final_values) {
        const year = parseInt(year_key);
        if (CURRENT_YEAR - year > 9) {
            year_count++;
            if (final_values[year] < 150000 && CURRENT_YEAR - year < 20) {
                num_fail_years++;
            }
            if (final_values[year] < 1000000 && CURRENT_YEAR - year < 25) {
                num_fail_years++;
            }
            if (final_values[year] < 500000 && CURRENT_YEAR - year < 30) {
                num_fail_years++;
            }
            if (final_values[year] < 0 && CURRENT_YEAR - year < 35) {
                num_fail_years++;
            }

            if (final_values[year] < ORIGINAL_BALANCE * 0.7) {
                num_bad_years++;
            }
            if (final_values[year] > ORIGINAL_BALANCE) {
                num_good_years++;
            }
            if (final_values[year] > ORIGINAL_BALANCE * 2) {
                num_great_years++;
            }
            if (final_values[year] > ORIGINAL_BALANCE * 4) {
                num_runaway_years++;
            }
            if (final_values[year] > final_values[best_year]) {
                best_year = year;
            }
            if (final_values[year] < final_values[worst_year]) {
                worst_year = year;
            }
        }
    }
    const ind = `${MIN_SPEND}, ${SPEND}`;
    stats[ind] = {
        Fail: num_fail_years,
        Bad: num_bad_years,
        Good: num_good_years,
        Great: num_great_years,
        Runaway: num_runaway_years
    };

}

function displayChart(level) {

    let outputElement = document.getElementById("output");

    let table = document.createElement("table");


    let topRow = document.createElement("tr");
    let corner = document.createElement("th");
    corner.textContent = level;
    topRow.appendChild(corner);
    for (let i = 0; i < 4; i++) {
        let cell = document.createElement("th");
        cell.textContent = "$" + Number(MIN_SPEND).toLocaleString('en');
        topRow.appendChild(cell);
        MIN_SPEND += min_spend_incr;
    }
    MIN_SPEND -= min_spend_incr * 4;
    table.appendChild(topRow);
    for (let i = 0; i < 7; i++) {
        let row = document.createElement("tr");
        let rowHead = document.createElement("th");
        rowHead.textContent = "$" + Number(SPEND).toLocaleString('en');
        row.appendChild(rowHead);
        for (var j = 0; j < 4; j++) {
            let cell = document.createElement("td");
            let key = "" + MIN_SPEND + ", " + SPEND;
            cell.textContent = stats[key][level];
            row.appendChild(cell);
            MIN_SPEND += min_spend_incr
        }
        MIN_SPEND -= min_spend_incr * 4;
        table.appendChild(row);
        SPEND += spend_incr;
    }
    SPEND -= spend_incr * 7;

    let title = "<h1>Results</h1><h2>" + year_count + " years analyzed</h2>";
    outputElement.innerHTML = title;
    outputElement.appendChild(table);
}

function displayGraph(ind) {
    let thisPlot = plotValues[ind];
    let xValues = [];
    let yValues = [];
    for (const [key, value] of Object.entries(thisPlot)) {
        for (let i = 0; i < value.length; i++) {
          xValues.push(key);
          yValues.push(value[i]);
        }
    }

    let canvas = document.getElementById('myCanvas');
    canvas.innerHTML = "<canvas id='myChart' width='400px' height='400px'></canvas>"
    let ctx = document.getElementById('myChart').getContext('2d');

    let bgColor, bgBorder;
    if (ind == 0) {
        bgColor = 'rgba(106, 158, 95, 0.5)';
        bgBorder = 'rgba(106, 158, 95, 1)';
    }
    else if (ind == 1) {
        bgColor = 'rgba(90, 141, 158, 0.5)';
        bgBorder = 'rgba(90, 141, 158, 1)';
    }
    else if (ind == 2) {
        bgColor = 'rgba(217, 147, 67, 0.5)';
        bgBorder = 'rgba(217, 147, 67, 1)';
    }
    else {
        bgColor = 'rgba(255, 99, 132, 0.5)';
        bgBorder = 'rgba(255, 99, 132, 1)';
    }
    let myChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Plot of Final values with $' + Math.round(MIN_SPEND/1000 + min_spend_incr/1000 * ind) + 'k Minimum Spend',
                data: xValues.map((value, index) => ({ x: value, y: yValues[index] })),
                backgroundColor: bgColor,
                borderColor: bgBorder,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom'
                },
                y: {
                    type: 'logarithmic',
                    position: 'left',
                    min: 0
                    
                }
            }
        }
    });
    myChart.update();
}


function updateLevel() {
    let level = document.getElementById("level").value;
    displayChart(level);
}

function updateMinLevel() {
    let level = document.getElementById("min-level").value;
    displayGraph(level);
}

function reset() {
    for (const prop of [portfolio, spend, income, final_values, output, plotValues]) {
        Object.keys(prop).forEach(key => delete prop[key]);
    }

}

// async function clearDict() {
//     try {
//         for (let i = 0; i < plotValues.length; i++) {
//             let myDictionary = plotValues[i];
//             for (let key in myDictionary) {
//                 delete myDictionary[key];
//             }
//         }
//     } catch (error) {
//         console.error("Error reading file:", error);
//     }
// }

async function runSim() {
    try {
        plot = 0;
        SPEND = document.getElementById('spend').value * 1000;
        ORIGINAL_BALANCE = document.getElementById('balance').value * 1000;
        MIN_SPEND = document.getElementById('min_spend').value * 1000;
        BOND_YIELD = document.getElementById('bond_yld').value/100;
        BOND_AMT = document.getElementById('bond_amt').value * 1000;
        PIGGY_BANK_INIT = document.getElementById('cash').value * 1000;
        PIGGY_BANK_TARGET = document.getElementById('cash_target').value * 1000;
        COLA = document.getElementById('cola').value/100;
        PENSION = document.getElementById('pension').value * 1000;
        PENSION_START = document.getElementById('pension_start').value * 1;
        SPOUSE_SSN = document.getElementById('spouse').value * 1000;
        SPOUSE_SSN_START = document.getElementById('spouse_start').value * 1;

        SP_AMT = ORIGINAL_BALANCE - BOND_AMT;

        let init_spend = SPEND;
        let init_min = MIN_SPEND;
        min_spend_incr = Math.trunc((SPEND - MIN_SPEND) / 3);

        if (SPEND < 50000) {
            spend_incr = 5000;
        }
        else if (SPEND < 100000) {
            spend_incr = 10000;
        }
        else if (spend < 150000) {
            spend_incr = 15000;
        }

        await read_sp();
        for (let j = 0; j < 4; j++) {
            for (let i = 0; i < 7; i++) {
                plotValues[plot]["" + SPEND] = [];

                run_year_sim();
                print_stats();
                SPEND += spend_incr;
            }
            SPEND = init_spend;
            let id = document.getElementById('min-level-' + plot);
            id.innerHTML = "" + MIN_SPEND/1000 + "k";
            MIN_SPEND += min_spend_incr;
            plot ++;
        }
        MIN_SPEND = init_min;
        let showLevels = document.querySelector('.result-level');
        showLevels.style.display = "block";
        let showMinLevels = document.querySelector('.result-min-level');
        showMinLevels.style.display = "block";
        displayChart("Good");
        displayGraph(0);
    } catch (error) {
        console.error("Error:", error);
    }
}