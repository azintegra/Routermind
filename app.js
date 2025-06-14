let map;
let addresses = [];
let optimizedData = [];

const BASE_URL = 'https://qazws345-routemindapiserver.hf.space';
// const GRAPH_HOPPER_API_KEY = 'YOUR_API_KEY_HERE'; // Put your actual GraphHopper key

const depots = [
    '7300 N Silverbell Rd, Tucson, AZ',
    '775 W Silverlake Rd, Tucson, AZ',
    '3780 E Valencia Rd, Tucson, AZ'
];

document.addEventListener("DOMContentLoaded", () => {
    populateDepotSelector();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${BASE_URL}/gatecodes`, {
                method: 'GET',
                headers: { 'Authorization': 'Basic ' + btoa(`${username}:${password}`) }
            });

            if (response.ok) {
                document.getElementById('login').style.display = 'none';
                document.getElementById('main').style.display = 'block';

                map = L.map('map').setView([32.2226, -110.9747], 12);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                document.getElementById('processBtn').disabled = false;
                document.getElementById('optimizeBtn').disabled = false;
            } else {
                alert('Login failed');
            }
        } catch (err) {
            console.error("Error during fetch:", err);
            alert('Error during login');
        }
    });

    document.getElementById('processBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('imageInput');
        const file = fileInput.files[0];
        if (!file) {
            alert("Please select an image first.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${BASE_URL}/upload`, {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + btoa(`${username}:${password}`) },
                body: formData
            });

            const data = await response.json();
            addresses = data.map(item => item.address);
            showExtractedAddresses(addresses);
            alert("Image processed successfully.");
        } catch (err) {
            console.error("Error processing image:", err);
            alert("Error processing image.");
        }
    });

    document.getElementById('optimizeBtn').addEventListener('click', async () => {
        const depotAddress = document.getElementById('depotSelect').value;

        // Geocode depot
        const depotCoord = await geocodeAddress(depotAddress);
        if (!depotCoord) {
            alert("Error geocoding depot address.");
            return;
        }

        // Geocode destination addresses
        const destinationCoords = [];
        for (let addr of addresses) {
            const coord = await geocodeAddress(addr);
            if (coord) {
                destinationCoords.push({ address: addr, ...coord });
            }
        }

        // Calculate route from depot to each destination
        const results = [];
        for (let dest of destinationCoords) {
            const url = `https://graphhopper.com/api/1/route?point=${depotCoord.lat},${depotCoord.lng}&point=${dest.lat},${dest.lng}&vehicle=car&key=${GRAPH_HOPPER_API_KEY}`;
            const routeResp = await fetch(url);
            const routeData = await routeResp.json();

            if (routeData.paths && routeData.paths.length > 0) {
                const dist = routeData.paths[0].distance / 1000; // km
                const time = routeData.paths[0].time / 60000; // min
                results.push({
                    address: dest.address,
                    distance: dist.toFixed(2),
                    time: time.toFixed(2),
                    lat: dest.lat,
                    lng: dest.lng
                });
            }
        }

        // Display result
        displayOptimizedRoute(depotCoord, depotAddress, results);
    });
});

// Populate depot select dropdown
function populateDepotSelector() {
    const select = document.createElement("select");
    select.id = "depotSelect";
    depots.forEach(addr => {
        const opt = document.createElement("option");
        opt.value = addr;
        opt.textContent = addr;
        select.appendChild(opt);
    });

    document.getElementById("main").insertBefore(select, document.getElementById("imageInput"));
}

function showExtractedAddresses(addresses) {
    const extractedDiv = document.getElementById('extractedAddresses');
    extractedDiv.innerHTML = '<h3>Extracted Addresses:</h3>';
    addresses.forEach((addr, index) => {
        extractedDiv.innerHTML += `<p>${index + 1}: ${addr}</p>`;
    });
}

async function geocodeAddress(addr) {
    const response = await fetch(`https://graphhopper.com/api/1/geocode?key=${GRAPH_HOPPER_API_KEY}&q=${encodeURIComponent(addr)}`);
    const data = await response.json();

    if (data.hits && data.hits.length > 0) {
        const coord = data.hits[0].point;
        return { lat: coord.lat, lng: coord.lng };
    } else {
        console.warn(`Address not found: ${addr}`);
        return null;
    }
}

function displayOptimizedRoute(depotCoord, depotAddress, routes) {
    const optimizedDiv = document.getElementById('optimizedAddresses');
    optimizedDiv.innerHTML = `<h3>Depot: ${depotAddress}</h3>`;

    routes.forEach((r, i) => {
        optimizedDiv.innerHTML += `<p>${i+1}: ${r.address} - ${r.distance} km / ${r.time} min</p>`;
    });

    // Generate Google Maps URL
    let googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(depotAddress)}`;

    if (routes.length > 0) {
        googleMapsUrl += `&destination=${encodeURIComponent(routes[routes.length - 1].address)}`;

        if (routes.length > 1) {
            const waypoints = routes.slice(0, -1).map(r => encodeURIComponent(r.address)).join('|');
            googleMapsUrl += `&waypoints=${waypoints}`;
        }
    }

    // Create and show the Open in Google Maps button
    const openMapsBtn = document.getElementById('openMapsBtn');
    openMapsBtn.style.display = 'block';
    openMapsBtn.onclick = () => {
        window.open(googleMapsUrl, '_blank');
    };

    // Plot on map
    if (map) {
        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });

        L.marker([depotCoord.lat, depotCoord.lng]).addTo(map).bindPopup("Depot").openPopup();
        const allCoords = [[depotCoord.lat, depotCoord.lng]];

        routes.forEach(r => {
            L.marker([r.lat, r.lng]).addTo(map).bindPopup(`${r.address}`);
            allCoords.push([r.lat, r.lng]);
        });

        L.polyline(allCoords, { color: 'blue' }).addTo(map);
        map.fitBounds(allCoords);
    }
}
