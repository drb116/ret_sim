fetch(targetUrl)
    .then(response => response.json())
    .then(data => {
        const myRides = [];
        const ridesList = document.getElementById('rides-list');

        data.liveData.forEach(ride => {
            if (favorites.includes(ride.name)) {
                myRides.push(ride);
            }
        });

        myRides.forEach(ride => {
            if (ride.status === "OPERATING") {
                const listItem = document.createElement('li');
                const nameSpan = document.createElement('span');
                const waitSpan = document.createElement('span');

                nameSpan.textContent = ride.name;
                
                if (ride.queue && ride.queue.STANDBY) {
                    const waitTime = ride.queue.STANDBY.waitTime;

                    waitSpan.textContent = ` - ${waitTime} min`;
                    if (waitTime <= 30) {
                        nameSpan.className = 'short-wait';
                    } else if (waitTime >= 60) {
                        nameSpan.className = 'long-wait';
                    }
                } else {
                    waitSpan.textContent = ` - No wait time available`;
                }

                waitSpan.className = 'wait';

                listItem.appendChild(nameSpan);
                listItem.appendChild(waitSpan);
                ridesList.appendChild(listItem);
            }
        });
    })
    .catch(error => console.error('Error fetching the data:', error));