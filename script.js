let map;
let directionsService;
let directionsRenderer;

let dangerMarkers = [];
let startMarker = null;
let endMarker = null;
let selectMode = null;

let DANGER_POINTS = [];
let sheetsPollingTimer = null;
let hasCalculatedRoute = false;

window.initMap = function () {
    const center = {
        lat: 33.9718,
        lng: 134.3625
    };

    map = new google.maps.Map(document.getElementById("map"), {
        center,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });

    directionsService = new google.maps.DirectionsService();

    directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: "#111827",
            strokeOpacity: 0.9,
            strokeWeight: 6
        }
    });

    setupEvents();
    startSheetsPolling();
};

function setupEvents() {
    document
        .getElementById("searchButton")
        .addEventListener("click", calculateRoute);

    document
        .getElementById("selectStartButton")
        .addEventListener("click", () => setSelectMode("start"));

    document
        .getElementById("selectEndButton")
        .addEventListener("click", () => setSelectMode("end"));

    map.addListener("click", event => {
        if (!selectMode) {
            return;
        }

        const position = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
        };

        if (selectMode === "start") {
            setStartPoint(position);
        }

        if (selectMode === "end") {
            setEndPoint(position);
        }

        setSelectMode(null);
    });
}

function setSelectMode(mode) {
    selectMode = mode;

    const startButton = document.getElementById("selectStartButton");
    const endButton = document.getElementById("selectEndButton");
    const selectModeText = document.getElementById("selectModeText");

    startButton.classList.remove("active");
    endButton.classList.remove("active");

    if (mode === "start") {
        startButton.classList.add("active");
        selectModeText.textContent = "地図上をクリックして、出発地点を指定してください。";
        map.setOptions({ draggableCursor: "crosshair" });
        return;
    }

    if (mode === "end") {
        endButton.classList.add("active");
        selectModeText.textContent = "地図上をクリックして、到着地点を指定してください。";
        map.setOptions({ draggableCursor: "crosshair" });
        return;
    }

    selectModeText.textContent = "地図上で地点を指定できます。";
    map.setOptions({ draggableCursor: null });
}

function setStartPoint(position) {
    document.getElementById("startLat").value = position.lat.toFixed(6);
    document.getElementById("startLng").value = position.lng.toFixed(6);

    const startPointText = document.getElementById("startPointText");
    startPointText.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

    if (!startMarker) {
        startMarker = new google.maps.Marker({
            position,
            map,
            draggable: true,
            label: {
                text: "出",
                color: "#ffffff",
                fontWeight: "700"
            },
            title: "出発地点"
        });

        startMarker.addListener("dragend", event => {
            const draggedPosition = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            };

            setStartPoint(draggedPosition);
        });

        return;
    }

    startMarker.setPosition(position);
}

function setEndPoint(position) {
    document.getElementById("endLat").value = position.lat.toFixed(6);
    document.getElementById("endLng").value = position.lng.toFixed(6);

    const endPointText = document.getElementById("endPointText");
    endPointText.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

    if (!endMarker) {
        endMarker = new google.maps.Marker({
            position,
            map,
            draggable: true,
            label: {
                text: "着",
                color: "#ffffff",
                fontWeight: "700"
            },
            title: "到着地点"
        });

        endMarker.addListener("dragend", event => {
            const draggedPosition = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            };

            setEndPoint(draggedPosition);
        });

        return;
    }

    endMarker.setPosition(position);
}

async function loadDangerPointsFromSheet() {
    const sheetStatus = document.getElementById("sheetStatus");

    if (!window.SHEET_CONFIG) {
        sheetStatus.textContent = "SHEET_CONFIGが設定されていません。";
        return;
    }

    const { apiKey, spreadsheetId, sheetName, range } = SHEET_CONFIG;

    if (
        !apiKey ||
        !spreadsheetId ||
        apiKey === "YOUR_SHEETS_API_KEY" ||
        spreadsheetId === "YOUR_SPREADSHEET_ID"
    ) {
        sheetStatus.textContent = "Sheets APIキーまたはスプレッドシートIDを設定してください。";
        return;
    }

    const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?key=${apiKey}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Sheets API error: ${response.status}`);
        }

        const data = await response.json();
        const rows = data.values || [];

        const nextPoints = rows
            .map((row, index) => {
                const lat = Number(row[0]);
                const lng = Number(row[1]);
                const level = Number(row[2]);

                return {
                    lat,
                    lng,
                    level,
                    rowNumber: index + 2
                };
            })
            .filter(point => {
                return (
                    Number.isFinite(point.lat) &&
                    Number.isFinite(point.lng) &&
                    Number.isFinite(point.level) &&
                    point.lat >= -90 &&
                    point.lat <= 90 &&
                    point.lng >= -180 &&
                    point.lng <= 180 &&
                    point.level >= 1 &&
                    point.level <= 3
                );
            });

        const hasChanged =
            JSON.stringify(nextPoints) !== JSON.stringify(DANGER_POINTS);

        if (!hasChanged) {
            sheetStatus.textContent = `危険情報 ${DANGER_POINTS.length}件を表示中です。`;
            return;
        }

        DANGER_POINTS = nextPoints;
        drawDangerPoints();

        sheetStatus.textContent = `危険情報 ${DANGER_POINTS.length}件を更新しました。`;

        if (hasCalculatedRoute) {
            calculateRoute();
        }
    } catch (error) {
        console.error("Sheets APIから危険情報を取得できませんでした:", error);
        sheetStatus.textContent = "Sheets APIから危険情報を取得できませんでした。共有設定やAPIキーを確認してください。";
    }
}

function startSheetsPolling() {
    loadDangerPointsFromSheet();

    if (sheetsPollingTimer) {
        clearInterval(sheetsPollingTimer);
    }

    sheetsPollingTimer = setInterval(() => {
        loadDangerPointsFromSheet();
    }, 5000);
}

function drawDangerPoints() {
    dangerMarkers.forEach(marker => marker.setMap(null));
    dangerMarkers = [];

    DANGER_POINTS.forEach(point => {
        const marker = new google.maps.Marker({
            position: {
                lat: point.lat,
                lng: point.lng
            },
            map,
            title: `暗さレベル ${point.level}`,
            icon: createMarkerIcon(point.level)
        });

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="font-size: 14px;">
                    <strong>暗さレベル ${point.level}</strong><br>
                    行番号: ${point.rowNumber}<br>
                    緯度: ${point.lat}<br>
                    経度: ${point.lng}
                </div>
            `
        });

        marker.addListener("click", () => {
            infoWindow.open(map, marker);
        });

        dangerMarkers.push(marker);
    });
}

function createMarkerIcon(level) {
    const colorMap = {
        1: "#f59e0b",
        2: "#f97316",
        3: "#dc2626"
    };

    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: colorMap[level] || "#6b7280",
        fillOpacity: 0.95,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        scale: 8
    };
}

function calculateRoute() {
    const startLat = Number(document.getElementById("startLat").value);
    const startLng = Number(document.getElementById("startLng").value);
    const endLat = Number(document.getElementById("endLat").value);
    const endLng = Number(document.getElementById("endLng").value);
    const thresholdMeters = Number(document.getElementById("threshold").value);

    if (
        !isValidCoordinate(startLat, startLng) ||
        !isValidCoordinate(endLat, endLng)
    ) {
        updateResult(null, [], "出発地点と到着地点を地図上で指定してください。");
        return;
    }

    const request = {
        origin: {
            lat: startLat,
            lng: startLng
        },
        destination: {
            lat: endLat,
            lng: endLng
        },
        travelMode: google.maps.TravelMode.WALKING,
        provideRouteAlternatives: true
    };

    directionsService.route(request, (result, status) => {
        if (status !== "OK") {
            updateResult(null, [], "ルートを取得できませんでした。地点を確認してください。");
            return;
        }

        hasCalculatedRoute = true;

        const evaluatedRoutes = result.routes.map((route, index) => {
            const routePath = route.overview_path.map(latLng => ({
                lat: latLng.lat(),
                lng: latLng.lng()
            }));

            const pointsOnRoute = findDangerPointsNearRoute(
                routePath,
                DANGER_POINTS,
                thresholdMeters
            );

            const levels = pointsOnRoute.map(point => point.level);

            const maxLevel = levels.length > 0
                ? Math.max(...levels)
                : 0;

            const averageLevel = levels.length > 0
                ? levels.reduce((sum, level) => sum + level, 0) / levels.length
                : 0;

            const dangerCount = pointsOnRoute.length;

            const distanceMeters = route.legs.reduce((sum, leg) => {
                return sum + leg.distance.value;
            }, 0);

            return {
                index,
                route,
                routePath,
                pointsOnRoute,
                maxLevel,
                averageLevel,
                dangerCount,
                distanceMeters
            };
        });

        evaluatedRoutes.sort((a, b) => {
            if (a.maxLevel !== b.maxLevel) {
                return a.maxLevel - b.maxLevel;
            }

            if (a.averageLevel !== b.averageLevel) {
                return a.averageLevel - b.averageLevel;
            }

            if (a.dangerCount !== b.dangerCount) {
                return a.dangerCount - b.dangerCount;
            }

            return a.distanceMeters - b.distanceMeters;
        });

        const bestRoute = evaluatedRoutes[0];

        directionsRenderer.setDirections(result);
        directionsRenderer.setRouteIndex(bestRoute.index);

        updateResultWithRoute(bestRoute, evaluatedRoutes.length);
        highlightDangerPoints(bestRoute.pointsOnRoute);
    });
}

function findDangerPointsNearRoute(routePath, dangerPoints, thresholdMeters) {
    return dangerPoints
        .map(point => {
            const distance = getMinimumDistanceToRoute(point, routePath);

            return {
                ...point,
                distance
            };
        })
        .filter(point => point.distance <= thresholdMeters);
}

function getMinimumDistanceToRoute(point, routePath) {
    let minDistance = Infinity;

    for (let i = 0; i < routePath.length - 1; i++) {
        const start = routePath[i];
        const end = routePath[i + 1];

        const distance = distancePointToSegmentMeters(point, start, end);

        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    return minDistance;
}

function distancePointToSegmentMeters(point, segmentStart, segmentEnd) {
    const originLat = point.lat;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(toRadians(originLat));

    const px = point.lng * metersPerDegreeLng;
    const py = point.lat * metersPerDegreeLat;

    const ax = segmentStart.lng * metersPerDegreeLng;
    const ay = segmentStart.lat * metersPerDegreeLat;

    const bx = segmentEnd.lng * metersPerDegreeLng;
    const by = segmentEnd.lat * metersPerDegreeLat;

    const abx = bx - ax;
    const aby = by - ay;

    const apx = px - ax;
    const apy = py - ay;

    const abLengthSquared = abx * abx + aby * aby;

    if (abLengthSquared === 0) {
        return Math.hypot(px - ax, py - ay);
    }

    const t = Math.max(
        0,
        Math.min(1, (apx * abx + apy * aby) / abLengthSquared)
    );

    const closestX = ax + t * abx;
    const closestY = ay + t * aby;

    return Math.hypot(px - closestX, py - closestY);
}

function updateResult(maxLevel, pointsOnRoute, customMessage = null) {
    const resultCard = document.getElementById("resultCard");
    const maxLevelText = document.getElementById("maxLevelText");
    const resultDetail = document.getElementById("resultDetail");

    resultCard.className = "result-card";

    if (customMessage) {
        maxLevelText.textContent = "判定できません";
        resultDetail.textContent = customMessage;
        return;
    }

    if (maxLevel === 0) {
        resultCard.classList.add("result-safe");
        maxLevelText.textContent = "危険ポイントなし";
        resultDetail.textContent = "指定した範囲内では、ルート上に危険情報ポイントは見つかりませんでした。";
        return;
    }

    resultCard.classList.add(`result-level-${maxLevel}`);
    maxLevelText.textContent = `最大暗さレベル ${maxLevel}`;

    const nearestText = pointsOnRoute
        .sort((a, b) => b.level - a.level || a.distance - b.distance)
        .map(point => `レベル${point.level} / 約${Math.round(point.distance)}m`)
        .join("、");

    resultDetail.textContent = `ルート付近で ${pointsOnRoute.length} 件の危険情報が見つかりました。対象: ${nearestText}`;
}

function updateResultWithRoute(bestRoute, routeCount) {
    const resultCard = document.getElementById("resultCard");
    const maxLevelText = document.getElementById("maxLevelText");
    const resultDetail = document.getElementById("resultDetail");

    resultCard.className = "result-card";

    const maxLevel = bestRoute.maxLevel;
    const averageLevelText = bestRoute.averageLevel.toFixed(2);
    const dangerCount = bestRoute.dangerCount;
    const distanceKm = (bestRoute.distanceMeters / 1000).toFixed(2);

    if (maxLevel === 0) {
        resultCard.classList.add("result-safe");
        maxLevelText.textContent = "安全寄りルート";
        resultDetail.textContent =
            `${routeCount}件の候補ルートから、危険情報が検出されないルートを選びました。距離は約${distanceKm}kmです。`;
        return;
    }

    resultCard.classList.add(`result-level-${maxLevel}`);
    maxLevelText.textContent = `推奨ルート：最大暗さレベル ${maxLevel}`;

    const pointText = bestRoute.pointsOnRoute
        .sort((a, b) => b.level - a.level || a.distance - b.distance)
        .map(point => `レベル${point.level} / 約${Math.round(point.distance)}m`)
        .join("、");

    resultDetail.textContent =
        `${routeCount}件の候補ルートから、最大暗さレベル、平均暗さレベル、危険情報件数、距離をもとに推奨ルートを選びました。平均暗さレベルは${averageLevelText}、危険情報は${dangerCount}件、距離は約${distanceKm}kmです。対象: ${pointText}`;
}

function highlightDangerPoints(pointsOnRoute) {
    const routePointKeys = new Set(
        pointsOnRoute.map(point => createPointKey(point))
    );

    dangerMarkers.forEach((marker, index) => {
        const point = DANGER_POINTS[index];
        const isOnRoute = routePointKeys.has(createPointKey(point));

        marker.setIcon({
            ...createMarkerIcon(point.level),
            scale: isOnRoute ? 12 : 8,
            strokeWeight: isOnRoute ? 4 : 2
        });
    });
}

function createPointKey(point) {
    return `${point.lat},${point.lng},${point.level},${point.rowNumber}`;
}

function isValidCoordinate(lat, lng) {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}