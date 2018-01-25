function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}

function get_data(next) {
    var data;
    while (!data) {
        data = JSON.parse(localStorage.getItem('data'));
        if (!data) {
            sleep(500);
        }
    }
    next(data);
}

function check_website(data, url) {
    var e, website, entity, entityId, simplifiedCurrentUrl;
    var foundEntities = [];
    for (entityId in data.entities.ids) {
        e = data.entities.ids[entityId];
        if (e.website) {
            website = parse_url(e.website);
            if (url.indexOf(website) !== -1) {
                foundEntities.push(e);
            }
        }
    }

    // console.log(foundEntities);

    if (foundEntities.length > 1) {
        let parser;
        let shortest = {
            pathName: ' '.repeat(100),
            entity: null
        };

        for (entity of foundEntities) {
            if (entity.website) {

                parser = document.createElement('a');
                parser.href = entity.website;
                if (parser.pathname.length < shortest.pathName.length) {
                    shortest = {
                        pathName: parser.pathname,
                        entity: entity
                    }
                }


                simplifiedCurrentUrl = parse_long_url(url);
                // console.log('Parsed URL', simplifiedCurrentUrl, entity.website);
                if (entity.website.indexOf(simplifiedCurrentUrl) !== -1) {
                    console.log('Found ' + simplifiedCurrentUrl + ' in ' + url.slice(0,30) + ' leading to entity : ' + entity.name);
                    return entity;
                }
            }
        }
        if (shortest.entity) {
            console.log('Found ' + shortest.entity.website + ' in ' + url.slice(0,30) + ' leading to entity : ' + shortest.entity.name);
        }
        return shortest.entity
    } else if (foundEntities.length === 1) {
        entity = foundEntities[0];
        console.log('Found ' + website + ' in ' + url.slice(0,30) + ' leading to entity : ' + entity.name);
        return entity;
    }

    return null;
}


function count_tabs() {
    localStorage['numberTabsOpen'] = 0;
    window.browser.windows.getAll({ populate: true }, function (windows) {
        windows.forEach(function (window) {
            window.tabs.forEach(function (tab) {
                localStorage['numberTabsOpen'] = parseInt(localStorage['numberTabsOpen']) + 1
            });
        });
    });
}

function log_tab(onglet, foundEntity) {


    localStorage['currentTabUrl'] = onglet.url;
    localStorage['currentTabTitle'] = onglet.title;
    localStorage['currentTabDomain'] = parse_url(onglet.url);
    localStorage['currentTabIsComplete'] = onglet.status === "complete";

    notifyMe(foundEntity)
}

function log_stats(tab, loggAndCount) {
    get_data(function (data) {
        const entity = check_website(data, tab.url);
        if (entity) {
            var stats;
            const day = new Date().getDay();
            if (localStorage.stats) {
                stats = JSON.parse(localStorage.stats);
                if (stats[entity.name]) {
                    if (stats[entity.name].month.length === 30) {
                        if (stats[entity.name].month[29].day === day) {
                            stats[entity.name].month[29].count += 1;
                        } else {
                            let newMonth = stats[entity.name].month.slice(1);
                            newMonth.push(
                                { day: day, count: 1 }
                            )
                            stats[entity.name].month = newMonth;
                        }
                    } else {
                        if (stats[entity.name].month[stats[entity.name].month.length - 1].day === day) {
                            stats[entity.name].month[stats[entity.name].month.length - 1].count += 1;
                        } else {
                            stats[entity.name].month.push({ day: day, count: 1 });
                        }
                    }
                    stats[entity.name].total += 1;
                } else {
                    stats[entity.name] = {
                        month: [
                            { day: day, count: 1 }
                        ],
                        total: 1
                    }
                }
            } else {
                stats = {};
                stats[entity.name] = {
                    month: [
                        { day: day, count: 1 }
                    ],
                    total: 1
                }
            }
            localStorage.stats = JSON.stringify(stats);
            if (loggAndCount) {
                sessionStorage['tab_' + tab.id + '_previous'] = tab.url;
                log_tab(tab, entity);
                count_tabs()
            }
        }
    });

}

function setParents(data, entity, parents) {
    if (
        Object
            .keys(data.shares.children)
            .indexOf(
            parseInt(entity.id, 10)
            ) !== -1
    ) {
        for (let share of data.shares.children[parseInt(entity.id, 10)]) {
            setParents(data, data.entities.ids[share.parent_id], parents)
        }
    } else if (
        Object
            .keys(data.shares.children)
            .indexOf(
            entity.id + ''
            ) !== -1
    ) {
        for (let share of data.shares.children[parseInt(entity.id, 10)]) {
            setParents(data, data.entities.ids[share.parent_id], parents)
        }
    } else {
        parents.push(entity)
    }
}

function getOwners(data, entity) {
    let owners = [];
    setParents(data, entity, owners);
    return owners.map(function (v, k) { return v.name });
}


function notification(data, entity) {
    let lang;
    const localLang = localStorage.getItem('activeLanguage');
    if (localLang) {
        lang = localLang;
    } else {
        const locale = JSON.parse(localStorage.getItem('reduxPersist:locale'));
        if (locale && locale.languages && locale.languages.length > 0) {
            for (let l of locale.languages) {
                if (l.active) {
                    lang = l.code;
                    break;
                }
            }
        } else {
            lang = navigator.language || navigator.userLanguage;
            lang = lang === 'fr' ? lang : 'en';
        }
        localStorage.setItem('activeLanguage', lang);
    }

    let body;
    if (lang === 'en') {
        body = ' belongs to '
    } else {
        body = ' appartient à ';
    }
    body = entity.name + body + getOwners(data, entity).join(', ');
    let config = {
        iconUrl: '/icon.png',
        message: body,
        title: 'Open Ownership Project',
        type: 'basic',
    };

    var notification = browser.notifications.create(
        '' + Math.random(), config, function (notifId) { console.log(notifId) }
    );
}


function notifyMe(foundEntity) {


    // browser allows notifications
    get_data(function (data) {

        const entity = typeof foundEntity === 'undefined' ?
            check_website(data, localStorage['currentTabUrl'])
            :
            foundEntity;

        if (entity) {
            var current_name = 'current_' + entity.name;
            var current_session = sessionStorage[current_name];
            var current_local = localStorage[current_name];
            // the website is known
            if (current_session && current_local) {
                sessionStorage[current_name] = parseInt(current_session) + 1;
                localStorage[current_name] = parseInt(current_local) + 1
            }
            else if (current_session && !current_local) {
                sessionStorage[current_name] = parseInt(current_session) + 1;
                localStorage[current_name] = sessionStorage[current_name]
            }
            else if (!current_session && current_local) {
                sessionStorage[current_name] = 1;
                localStorage[current_name] = parseInt(current_local) + 1;
                notification(data, entity)
            }
            else if (!current_session && !current_local) {
                sessionStorage['current_' + entity.name] = 1;
                localStorage['current_' + entity.name] = 1;
                notification(data, entity)
            }
        }


    })

}


function parse_url(url) {
    var parser = document.createElement('a');
    parser.href = url;
    var new_url = parser.hostname;
    if (new_url.indexOf("www.") === 0) {
        new_url = new_url.substring(4, new_url.length)
    }
    return new_url
}

function parse_long_url(url) {
    var parser = document.createElement('a');
    parser.href = url;
    var new_url = parser.hostname;
    var path_name = parser.pathname;
    path_name = path_name.split('/')[1];

    if (new_url.indexOf("www.") === 0) {
        new_url = new_url.substring(4, new_url.length)
    }
    return path_name.length <= 1 ? new_url : new_url + '/' + path_name
}