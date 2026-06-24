let map;
let directionsService;
let directionsRenderer;

let selectMode = null;
let addDangerMode = false;

let startMarker = null;
let endMarker = null;
let pendingDangerMarker = null;

let selectedDangerPosition = null;

let dangerMarkers = [];
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
    document.getElementById("selectStartButton").addEventListener("click", () => {
        setSelectMode("start");
    });

    document.getElementById("selectEndButton").addEventListener("click", () => {
        setSelectMode("end");
    });

    document.getElementById("searchButton").addEventListener("click", calculateRoute);

    document.getElementById("addDangerButton").addEventListener("click", startAddDangerMode);
    document.getElementById("submitDangerButton").addEventListener("click", submitDangerInfo);
    document.getElementById("cancelDangerButton").addEventListener("click", cancelAddDangerMode);

    map.addListener("click", event => {
        const position = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
        };

        if (addDangerMode) {
            setDangerInputPosition(position);
            return;
        }

        if (!selectMode) {
            return;
        }

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
    addDangerMode = false;

    document.getElementById("selectStartButton").classList.remove("active");
    document.getElementById("selectEndButton").classList.remove("active");
    document.getElementById("addDangerButton").classList.remove("active");

    const routeModeText = document.getElementById("routeModeText");

    if (mode === "start") {
        document.getElementById("selectStartButton").classList.add("active");
        routeModeText.textContent = "地図上をクリックして、出発地点を指定してください。";
        map.setOptions({ draggableCursor: "crosshair" });
        return;
    }

    if (mode === "end") {
        document.getElementById("selectEndButton").classList.add("active");
        routeModeText.textContent = "地図上をクリックして、到着地点を指定してください。";
        map.setOptions({ draggableCursor: "crosshair" });
        return;
    }

    routeModeText.textContent = "地図上で出発地点と到着地点を指定できます。";
    map.setOptions({ draggableCursor: null });
}

function setStartPoint(position) {
    document.getElementById("startLat").value = position.lat.toFixed(6);
    document.getElementById("startLng").value = position.lng.toFixed(6);
    document.getElementById("startPointText").textContent =
        `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

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
            setStartPoint({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            });
        });

        return;
    }

    startMarker.setPosition(position);
}

function setEndPoint(position) {
    document.getElementById("endLat").value = position.lat.toFixed(6);
    document.getElementById("endLng").value = position.lng.toFixed(6);
    document.getElementById("endPointText").textContent =
        `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

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
            setEndPoint({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            });
        });

        return;
    }

    endMarker.setPosition(position);
}

function startAddDangerMode() {
    addDangerMode = true;
    selectMode = null;
    selectedDangerPosition = null;

    document.getElementById("selectStartButton").classList.remove("active");
    document.getElementById("selectEndButton").classList.remove("active");
    document.getElementById("addDangerButton").classList.add("active");

    document.getElementById("routeModeText").textContent =
        "地図上で出発地点と到着地点を指定できます。";

    document.getElementById("addModeText").textContent =
        "地図上で、暗さ情報を登録したい場所をクリックしてください。";

    document.getElementById("dangerForm").classList.add("hidden");
    document.getElementById("submitStatus").textContent = "";

    if (pendingDangerMarker) {
        pendingDangerMarker.setMap(null);
        pendingDangerMarker = null;
    }

    map.setOptions({ draggableCursor: "crosshair" });
}

function setDangerInputPosition(position) {
    selectedDangerPosition = position;

    document.getElementById("dangerLocationText").textContent =
        `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

    document.getElementById("dangerForm").classList.remove("hidden");
    document.getElementById("addModeText").textContent =
        "場所を選択しました。内容を入力して登録してください。";

    if (!pendingDangerMarker) {
        pendingDangerMarker = new google.maps.Marker({
            position,
            map,
            draggable: true,
            label: {
                text: "＋",
                color: "#ffffff",
                fontWeight: "700"
            },
            title: "追加予定の危険情報"
        });

        pendingDangerMarker.addListener("dragend", event => {
            setDangerInputPosition({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            });
        });

        return;
    }

    pendingDangerMarker.setPosition(position);
}

async function submitDangerInfo() {
    const submitStatus = document.getElementById("submitStatus");

    if (!selectedDangerPosition) {
        submitStatus.textContent = "地図上で場所を選択してください。";
        return;
    }

    const placeName = document.getElementById("dangerPlaceName").value.trim();
    const level = Number(document.getElementById("dangerLevel").value);
    const note = document.getElementById("dangerNote").value.trim();

    if (!placeName) {
        submitStatus.textContent = "当該箇所名を入力してください。";
        return;
    }

    if (![1, 2, 3].includes(level)) {
        submitStatus.textContent = "暗さレベルを選択してください。";
        return;
    }

    if (!APP_CONFIG.submitUrl || APP_CONFIG.submitUrl === "YOUR_APPS_SCRIPT_WEB_APP_URL") {
        submitStatus.textContent = "Apps ScriptのWebアプリURLが設定されていません。";
        return;
    }

    const payload = {
        placeName,
        lat: selectedDangerPosition.lat,
        lng: selectedDangerPosition.lng,
        level,
        note
    };

    submitStatus.textContent = "登録中です。";

    try {
        await fetch(APP_CONFIG.submitUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        });

        submitStatus.textContent = "登録しました。数秒以内に地図へ反映されます。";

        clearDangerForm();
        cancelAddDangerMode();

        setTimeout(() => {
            loadDangerPointsFromSheet();

            if (hasCalculatedRoute) {
                calculateRoute();
            }
        }, 1500);
    } catch (error) {
        console.error(error);
        submitStatus.textContent = "登録に失敗しました。Apps ScriptのURLや公開設定を確認してください。";
    }
}

function cancelAddDangerMode() {
    addDangerMode = false;
    selectedDangerPosition = null;

    document.getElementById("addDangerButton").classList.remove("active");
    document.getElementById("addModeText").textContent =
        "ボタンを押してから、地図上の該当箇所をクリックしてください。";

    document.getElementById("dangerForm").classList.add("hidden");

    if (pendingDangerMarker) {
        pendingDangerMarker.setMap(null);
        pendingDangerMarker = null;
    }

    map.setOptions({ draggableCursor: null });
}

function clearDangerForm() {
    document.getElementById("dangerPlaceName").value = "";
    document.getElementById("dangerLevel").value = "1";
    document.getElementById("dangerNote").value = "";
    document.getElementById("dangerLocationText").textContent = "未選択";
}

async function loadDangerPointsFromSheet() {
    const sheetStatus = document.getElementById("sheetStatus");

    if (
        !APP_CONFIG.apiKey ||
        !APP_CONFIG.spreadsheetId ||
        APP_CONFIG.apiKey === "YOUR_API_KEY" ||
        APP_CONFIG.spreadsheetId === "YOUR_SPREADSHEET_ID"
    ) {
        sheetStatus.textContent = "APIキーまたはスプレッドシートIDを設定してください。";
        return;
    }

    const encodedRange = encodeURIComponent(`${APP_CONFIG.sheetName}!${APP_CONFIG.readRange}`);
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${APP_CONFIG.spreadsheetId}/values/${encodedRange}?key=${APP_CONFIG.apiKey}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Sheets API error:", response.status, errorText);
            throw new Error(`Sheets API error: ${response.status}`);
        }

        const data = await response.json();
        const rows = data.values || [];

        const nextPoints = rows
            .map((row, index) => {
                const placeName = String(row[0] || "").trim();
                const lat = Number(row[1]);
                const lng = Number(row[2]);
                const level = Number(row[3]);
                const note = String(row[4] || "").trim();

                return {
                    placeName,
                    lat,
                    lng,
                    level,
                    note,
                    rowNumber: index + 2
                };
            })
            .filter(point => {
                return (
                    point.placeName &&
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

        const hasChanged = JSON.stringify(nextPoints) !== JSON.stringify(DANGER_POINTS);

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
        console.error(error);
        sheetStatus.textContent =
            "Sheets APIから危険情報を取得できませんでした。共有設定、APIキー、シート名を確認してください。";
    }
}

function startSheetsPolling() {
    loadDangerPointsFromSheet();

    if (sheetsPollingTimer) {
        clearInterval(sheetsPollingTimer);
    }

    sheetsPollingTimer = setInterval(() => {
        loadDangerPointsFromSheet();
    }, APP_CONFIG.pollingMs || 5000);
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
            title: `${point.placeName} / レベル${point.level}`,
            icon: createMarkerIcon(point.level)
        });

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="font-size: 14px; line-height: 1.7;">
                    <strong>${escapeHtml(point.placeName)}</strong><br>
                    暗さレベル: ${point.level}<br>
                    緯度: ${point.lat}<br>
                    経度: ${point.lng}<br>
                    備考: ${escapeHtml(point.note || "なし")}
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
        updateResultMessage("判定できません", "出発地点と到着地点を地図上で指定してください。");
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
            updateResultMessage("判定できません", "ルートを取得できませんでした。地点を確認してください。");
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

            const maxLevel = levels.length > 0 ? Math.max(...levels) : 0;
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
            return {
                ...point,
                distance: getMinimumDistanceToRoute(point, routePath)
            };
        })
        .filter(point => point.distance <= thresholdMeters);
}

function getMinimumDistanceToRoute(point, routePath) {
    let minDistance = Infinity;

    for (let i = 0; i < routePath.length - 1; i++) {
        const distance = distancePointToSegmentMeters(
            point,
            routePath[i],
            routePath[i + 1]
        );

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

function updateResultWithRoute(bestRoute, routeCount) {
    const resultCard = document.getElementById("resultCard");
    const maxLevelText = document.getElementById("maxLevelText");
    const resultDetail = document.getElementById("resultDetail");

    resultCard.className = "card result-card";

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
        .map(point => `${point.placeName}: レベル${point.level} / 約${Math.round(point.distance)}m`)
        .join("、");

    resultDetail.textContent =
        `${routeCount}件の候補ルートから、最大暗さレベル、平均暗さレベル、危険情報件数、距離をもとに推奨ルートを選びました。平均暗さレベルは${averageLevelText}、危険情報は${dangerCount}件、距離は約${distanceKm}kmです。対象: ${pointText}`;
}

function updateResultMessage(title, detail) {
    const resultCard = document.getElementById("resultCard");
    const maxLevelText = document.getElementById("maxLevelText");
    const resultDetail = document.getElementById("resultDetail");

    resultCard.className = "card result-card";
    maxLevelText.textContent = title;
    resultDetail.textContent = detail;
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
    return `${point.placeName},${point.lat},${point.lng},${point.level},${point.rowNumber}`;
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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}