from flask import Blueprint, render_template, request, redirect, url_for, session
from functools import wraps
from app.services import service_x
import random
