#!/usr/bin/env python3
"""
Populates your MongoDB-backed Task Management API with random users and tasks.
Compatible with Node.js + Express + Mongoose API (JSON bodyParser).
"""

import sys
import getopt
import http.client
import json
import os
from random import randint, choice
from datetime import date
from time import mktime

def usage():
    print('Usage: dbFill.py -u <baseurl> -p <port> -n <numUsers> -t <numTasks>')

def main(argv):
    baseurl = "localhost"
    port = 3000
    userCount = 20
    taskCount = 100

    try:
        opts, args = getopt.getopt(argv, "hu:p:n:t:", ["url=", "port=", "users=", "tasks="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            usage()
            sys.exit()
        elif opt in ("-u", "--url"):
            baseurl = str(arg)
        elif opt in ("-p", "--port"):
            port = int(arg)
        elif opt in ("-n", "--users"):
            userCount = int(arg)
        elif opt in ("-t", "--tasks"):
            taskCount = int(arg)

    # Name lists
    firstNames = ["james","john","robert","michael","william","david","richard","charles","joseph","thomas","christopher","daniel","paul","mark","donald","george","kenneth","steven","edward","brian","ronald","anthony","kevin","jason","matthew","gary","timothy","jose","larry","jeffrey","frank","scott","eric","stephen","andrew","raymond","gregory","joshua","jerry","dennis","walter","patrick","peter","harold","douglas","henry","carl","arthur","ryan","roger","joe","juan","jack","albert","jonathan","justin","terry","gerald","keith","samuel","willie","ralph","lawrence","nicholas","roy","benjamin","bruce","brandon","adam","harry","fred","wayne","billy","steve","louis","jeremy","aaron","randy","howard","eugene","carlos","russell","bobby","victor","martin","ernest","phillip","todd","jesse","craig","alan","shawn","clarence","sean","philip","chris","johnny","earl","jimmy","antonio","danny","bryan","tony","luis","mike","stanley","leonard","nathan","dale","manuel","rodney","curtis","norman","allen","marvin","vincent","glenn","jeffery","travis","jeff","chad","jacob","lee","melvin","alfred","kyle","francis","bradley","jesus","herbert","frederick","ray","joel","edwin","don","eddie","ricky","troy","randall","barry","alexander","bernard","mario","leroy","francisco","marcus","micheal","theodore","clifford","miguel","oscar","jay","jim","tom","calvin","alex","jon","ronnie","bill","lloyd","tommy","leon","derek","warren","darrell","jerome","floyd","leo","alvin","tim","wesley","gordon","dean","greg","jorge","dustin","pedro","derrick","dan","lewis","zachary","corey","herman","maurice","vernon","roberto","clyde","glen","hector","shane","ricardo","sam","rick","lester","brent","ramon","charlie","tyler","gilbert","gene"]
    lastNames = ["smith","johnson","williams","jones","brown","davis","miller","wilson","moore","taylor","anderson","thomas","jackson","white","harris","martin","thompson","garcia","martinez","robinson","clark","rodriguez","lewis","lee","walker","hall","allen","young","hernandez","king","wright","lopez","hill","scott","green","adams","baker","gonzalez","nelson","carter","mitchell","perez","roberts","turner","phillips","campbell","parker","evans","edwards","collins","stewart","sanchez","morris","rogers","reed","cook","morgan","bell","murphy","bailey","rivera","cooper","richardson","cox","howard","ward","torres","peterson","gray","ramirez","james","watson","brooks","kelly","sanders","price","bennett","wood","barnes","ross","henderson","coleman","jenkins","perry","powell","long","patterson","hughes","flores","washington","butler","simmons","foster","gonzales","bryant","alexander","russell","griffin","diaz","hayes"]

    conn = http.client.HTTPConnection(baseurl, port)
    headers = {"Content-type": "application/json", "Accept": "application/json"}

    userIDs, userNames, userEmails = [], [], []

    print(f" Creating {userCount} users...")

    for i in range(userCount):
        x = randint(0, len(firstNames) - 1)
        y = randint(0, len(lastNames) - 1)
        user_payload = json.dumps({
            "name": f"{firstNames[x]} {lastNames[y]}",
            "email": f"{firstNames[x]}@{lastNames[y]}.com"
        })
        conn.request("POST", "/api/users", user_payload, headers)
        response = conn.getresponse()
        data = response.read().decode('utf-8').strip()

        if not data:
            print("Empty user response, skipping...")
            continue

        try:
            d = json.loads(data)
        except Exception as e:
            print(" Could not parse user JSON:", data, e)
            continue

        user_data = d.get('data', {})
        if isinstance(user_data, dict) and '_id' in user_data:
            userIDs.append(str(user_data['_id']))
            userNames.append(str(user_data.get('name', '')))
            userEmails.append(str(user_data.get('email', '')))
        else:
            print("Skipping malformed user:", d)

    print(f"Created {len(userIDs)} users.")

    # Load task names
    task_path = os.path.join(os.path.dirname(__file__), 'tasks.txt')
    if not os.path.exists(task_path):
        print(" tasks.txt not found in database_scripts/")
        sys.exit(1)

    with open(task_path, 'r') as f:
        taskNames = f.read().splitlines()

    print(f"Creating {taskCount} tasks...")

    for i in range(taskCount):
        assigned = randint(0, 10) > 4
        assigned_idx = randint(0, len(userIDs) - 1) if assigned and userIDs else -1
        assignedUserID = userIDs[assigned_idx] if assigned else ""
        assignedUserName = userNames[assigned_idx] if assigned else "unassigned"
        completed = randint(0, 10) > 5
        deadline = (mktime(date.today().timetuple()) + randint(86400, 864000)) * 1000
        description = "Auto-generated task for API testing."

        task_payload = json.dumps({
            "name": choice(taskNames),
            "description": description,
            "deadline": deadline,
            "completed": completed,
            "assignedUser": assignedUserID,
            "assignedUserName": assignedUserName
        })

        conn.request("POST", "/api/tasks", task_payload, headers)
        response = conn.getresponse()
        data = response.read().decode('utf-8').strip()

        if not data:
            print("Empty task response, skipping...")
            continue

        try:
            d = json.loads(data)
        except Exception as e:
            print("Could not parse task JSON:", data, e)
            continue

    conn.close()
    print(f"🎉 {len(userIDs)} users and {taskCount} tasks added successfully at {baseurl}:{port}")

if __name__ == "__main__":
    main(sys.argv[1:])
